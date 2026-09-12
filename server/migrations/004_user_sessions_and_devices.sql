-- Session lock, device registry, and admin OTP force-login
-- Safe to run more than once.

CREATE TABLE IF NOT EXISTS user_devices (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(128) NOT NULL,
  user_email VARCHAR(255) NOT NULL,
  device_id VARCHAR(128) NOT NULL,
  device_type VARCHAR(32) NOT NULL DEFAULT 'unknown',
  device_name VARCHAR(255) DEFAULT '',
  user_agent TEXT,
  last_ip VARCHAR(64) DEFAULT '',
  first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_device (user_email, device_id),
  INDEX idx_user_devices_email (user_email),
  INDEX idx_user_devices_last_seen (last_seen)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_sessions (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(128) NOT NULL,
  user_email VARCHAR(255) NOT NULL,
  device_id VARCHAR(128) NOT NULL,
  device_type VARCHAR(32) DEFAULT 'unknown',
  device_name VARCHAR(255) DEFAULT '',
  user_agent TEXT,
  ip_address VARCHAR(64) DEFAULT '',
  status VARCHAR(16) DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
  revoked_at DATETIME NULL,
  revoked_by VARCHAR(255) NULL,
  INDEX idx_sessions_email_status (user_email, status),
  INDEX idx_sessions_device (device_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS admin_login_otps (
  id VARCHAR(64) PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  otp_hash VARCHAR(255) NOT NULL,
  purpose VARCHAR(32) DEFAULT 'force_login',
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_otp_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
