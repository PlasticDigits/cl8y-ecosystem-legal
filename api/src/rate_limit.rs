use axum::{extract::Request, middleware::Next, response::Response};
use dashmap::DashMap;
use governor::{
    clock::DefaultClock,
    state::{InMemoryState, NotKeyed},
    Quota, RateLimiter,
};
use std::{
    net::IpAddr,
    num::NonZeroU32,
    sync::Arc,
};

use crate::error::AppError;

#[derive(Clone)]
pub struct RateLimitState {
    read_per_min: u32,
    write_per_min: u32,
    read_buckets: Arc<DashMap<IpAddr, Arc<RateLimiter<NotKeyed, InMemoryState, DefaultClock>>>>,
    write_buckets: Arc<DashMap<IpAddr, Arc<RateLimiter<NotKeyed, InMemoryState, DefaultClock>>>>,
    update_terms_buckets: Arc<DashMap<IpAddr, Arc<RateLimiter<NotKeyed, InMemoryState, DefaultClock>>>>,
}

impl RateLimitState {
    pub fn new(read_per_min: u32, write_per_min: u32) -> Self {
        Self {
            read_per_min,
            write_per_min,
            read_buckets: Arc::new(DashMap::new()),
            write_buckets: Arc::new(DashMap::new()),
            update_terms_buckets: Arc::new(DashMap::new()),
        }
    }

    /// Public `/update_terms`: 1 request per second per IP.
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
}

pub fn client_ip(req: &Request) -> IpAddr {
    if let Some(xff) = req.headers().get("x-forwarded-for") {
        if let Ok(s) = xff.to_str() {
            if let Some(first) = s.split(',').next() {
                if let Ok(ip) = first.trim().parse() {
                    return ip;
                }
            }
        }
    }
    req.extensions()
        .get::<axum::extract::ConnectInfo<std::net::SocketAddr>>()
        .map(|c| c.0.ip())
        .unwrap_or(IpAddr::from([127, 0, 0, 1]))
}

pub async fn rate_limit_middleware(
    axum::extract::State(state): axum::extract::State<RateLimitState>,
    req: Request,
    next: Next,
) -> Result<Response, AppError> {
    let ip = client_ip(&req);

    if req.uri().path() == "/update_terms" {
        state.check_update_terms(ip)?;
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
    use std::net::{IpAddr, Ipv4Addr};

    #[test]
    fn update_terms_allows_one_per_second() {
        let state = RateLimitState::new(60, 10);
        let ip = IpAddr::V4(Ipv4Addr::new(203, 0, 113, 1));
        state.check_update_terms(ip).unwrap();
        assert!(state.check_update_terms(ip).is_err());
    }
}
