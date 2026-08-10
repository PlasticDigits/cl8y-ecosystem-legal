//! Per-IP rate limiting.
//!
//! # Client IP / X-Forwarded-For policy (invariant)
//! - **Default:** use the TCP peer (`ConnectInfo`) only. Spoofed `X-Forwarded-For` is ignored.
//! - **Trusted proxy mode:** if the peer IP is inside `TRUSTED_PROXY_CIDRS`, honor XFF.
//! - **Hop selection:** when XFF is honored, use the **rightmost** valid IP in the header.
//!   Reverse proxies that *append* the observed client address put the trustworthy hop last;
//!   leftmost values may be client-supplied and are not trusted.
//! - Missing/invalid XFF under trusted-proxy mode falls back to the peer IP.
//! - Malformed lists never panic; invalid hops are skipped when scanning right-to-left.

use axum::{extract::Request, middleware::Next, response::Response};
use dashmap::DashMap;
use governor::{
    clock::DefaultClock,
    state::{InMemoryState, NotKeyed},
    Quota, RateLimiter,
};
use ipnet::IpNet;
use std::{net::IpAddr, num::NonZeroU32, sync::Arc};

use crate::error::AppError;

type IpLimiter = RateLimiter<NotKeyed, InMemoryState, DefaultClock>;
type IpBuckets = DashMap<IpAddr, Arc<IpLimiter>>;

#[derive(Clone)]
pub struct RateLimitState {
    read_per_min: u32,
    write_per_min: u32,
    trusted_proxy_cidrs: Arc<Vec<IpNet>>,
    read_buckets: Arc<IpBuckets>,
    write_buckets: Arc<IpBuckets>,
    update_terms_buckets: Arc<IpBuckets>,
}

impl RateLimitState {
    pub fn new(read_per_min: u32, write_per_min: u32, trusted_proxy_cidrs: Vec<IpNet>) -> Self {
        Self {
            read_per_min,
            write_per_min,
            trusted_proxy_cidrs: Arc::new(trusted_proxy_cidrs),
            read_buckets: Arc::new(DashMap::new()),
            write_buckets: Arc::new(DashMap::new()),
            update_terms_buckets: Arc::new(DashMap::new()),
        }
    }

    /// Authenticated `/update_terms`: 1 request per second per IP.
    pub fn check_update_terms(&self, ip: IpAddr) -> Result<(), AppError> {
        let limiter = self.update_terms_buckets.entry(ip).or_insert_with(|| {
            let quota = Quota::per_second(NonZeroU32::new(1).unwrap());
            Arc::new(RateLimiter::direct(quota))
        });
        limiter.check().map_err(|_| AppError::TooManyRequests)
    }

    fn check(&self, ip: IpAddr, is_write: bool) -> Result<(), AppError> {
        let buckets = if is_write {
            &self.write_buckets
        } else {
            &self.read_buckets
        };
        let per_min = if is_write {
            self.write_per_min
        } else {
            self.read_per_min
        };

        let limiter = buckets.entry(ip).or_insert_with(|| {
            let quota = Quota::per_minute(NonZeroU32::new(per_min.max(1)).unwrap());
            Arc::new(RateLimiter::direct(quota))
        });

        limiter.check().map_err(|_| AppError::TooManyRequests)
    }

    pub fn client_ip(&self, req: &Request) -> IpAddr {
        client_ip(req, &self.trusted_proxy_cidrs)
    }

    pub fn client_ip_from_parts(&self, peer: IpAddr, x_forwarded_for: Option<&str>) -> IpAddr {
        resolve_client_ip(peer, x_forwarded_for, &self.trusted_proxy_cidrs)
    }
}

fn peer_ip(req: &Request) -> IpAddr {
    req.extensions()
        .get::<axum::extract::ConnectInfo<std::net::SocketAddr>>()
        .map(|c| c.0.ip())
        .unwrap_or(IpAddr::from([127, 0, 0, 1]))
}

fn peer_is_trusted(peer: IpAddr, trusted: &[IpNet]) -> bool {
    trusted.iter().any(|net| net.contains(&peer))
}

/// Rightmost valid IP in a comma-separated `X-Forwarded-For` value.
pub fn rightmost_xff_ip(xff: &str) -> Option<IpAddr> {
    for hop in xff.split(',').rev() {
        let hop = hop.trim();
        if hop.is_empty() {
            continue;
        }
        if let Ok(ip) = hop.parse::<IpAddr>() {
            return Some(ip);
        }
    }
    None
}

pub fn resolve_client_ip(
    peer: IpAddr,
    x_forwarded_for: Option<&str>,
    trusted_proxy_cidrs: &[IpNet],
) -> IpAddr {
    if !peer_is_trusted(peer, trusted_proxy_cidrs) {
        return peer;
    }
    if let Some(xff) = x_forwarded_for {
        if let Some(ip) = rightmost_xff_ip(xff) {
            return ip;
        }
    }
    peer
}

pub fn client_ip(req: &Request, trusted_proxy_cidrs: &[IpNet]) -> IpAddr {
    let peer = peer_ip(req);
    let xff = req
        .headers()
        .get("x-forwarded-for")
        .and_then(|v| v.to_str().ok());
    resolve_client_ip(peer, xff, trusted_proxy_cidrs)
}

pub async fn rate_limit_middleware(
    axum::extract::State(state): axum::extract::State<RateLimitState>,
    req: Request,
    next: Next,
) -> Result<Response, AppError> {
    let ip = state.client_ip(&req);

    // `/update_terms` is rate-limited inside the handler *after* Bearer auth so
    // unauthenticated floods return 401 without exhausting the ops bucket.
    if req.uri().path() == "/update_terms" {
        return Ok(next.run(req).await);
    }

    let is_write = req.method() == axum::http::Method::POST
        || req.method() == axum::http::Method::PUT
        || req.method() == axum::http::Method::DELETE;

    state.check(ip, is_write)?;
    Ok(next.run(req).await)
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::Request as HttpRequest;
    use std::net::{IpAddr, Ipv4Addr, SocketAddr};

    fn req_with_peer_and_xff(peer: IpAddr, xff: Option<&str>) -> Request {
        let mut builder = HttpRequest::builder().uri("/api/v1/terms/latest");
        if let Some(v) = xff {
            builder = builder.header("x-forwarded-for", v);
        }
        let mut req = builder.body(axum::body::Body::empty()).unwrap();
        req.extensions_mut()
            .insert(axum::extract::ConnectInfo(SocketAddr::new(peer, 443)));
        req
    }

    #[test]
    fn update_terms_allows_one_per_second() {
        let state = RateLimitState::new(60, 10, vec![]);
        let ip = IpAddr::V4(Ipv4Addr::new(203, 0, 113, 1));
        state.check_update_terms(ip).unwrap();
        assert!(state.check_update_terms(ip).is_err());
    }

    #[test]
    fn xff_ignored_without_trusted_proxy() {
        let peer = IpAddr::V4(Ipv4Addr::new(198, 51, 100, 10));
        let req = req_with_peer_and_xff(peer, Some("1.2.3.4, 5.6.7.8"));
        assert_eq!(client_ip(&req, &[]), peer);
    }

    #[test]
    fn xff_rightmost_used_when_peer_trusted() {
        let peer = IpAddr::V4(Ipv4Addr::new(10, 0, 0, 2));
        let trusted = vec!["10.0.0.0/8".parse().unwrap()];
        let req = req_with_peer_and_xff(peer, Some("1.2.3.4, 203.0.113.9"));
        assert_eq!(
            client_ip(&req, &trusted),
            IpAddr::V4(Ipv4Addr::new(203, 0, 113, 9))
        );
    }

    #[test]
    fn xff_skips_invalid_hops_from_the_right() {
        assert_eq!(
            rightmost_xff_ip("1.2.3.4, not-an-ip, 203.0.113.9"),
            Some(IpAddr::V4(Ipv4Addr::new(203, 0, 113, 9)))
        );
        assert_eq!(rightmost_xff_ip("bogus, still-bad"), None);
    }

    #[test]
    fn spoofed_xff_does_not_split_buckets_without_trust() {
        let state = RateLimitState::new(1, 1, vec![]);
        let peer = IpAddr::V4(Ipv4Addr::new(198, 51, 100, 20));
        // Two requests with different spoofed XFF still share the peer bucket.
        let req1 = req_with_peer_and_xff(peer, Some("1.1.1.1"));
        let req2 = req_with_peer_and_xff(peer, Some("2.2.2.2"));
        let ip1 = state.client_ip(&req1);
        let ip2 = state.client_ip(&req2);
        assert_eq!(ip1, peer);
        assert_eq!(ip2, peer);
        state.check(ip1, true).unwrap();
        assert!(state.check(ip2, true).is_err());
    }
}
