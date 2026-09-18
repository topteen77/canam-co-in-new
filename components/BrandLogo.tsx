import React from 'react';

export const BRAND_LOGO_SRC = '/iapply-canam-logo.png';
export const BRAND_LOGO_ALT = 'iApply Canam';

interface BrandLogoProps {
  className?: string;
  heightClass?: string;
  alt?: string;
  variant?: 'dark' | 'light';
  animate?: boolean;
}

const BrandLogo: React.FC<BrandLogoProps> = ({
  className = '',
  heightClass = 'h-10',
  alt = BRAND_LOGO_ALT,
  variant = 'dark',
  animate = false,
}) => (
  <img
    src={BRAND_LOGO_SRC}
    alt={alt}
    className={`${heightClass} w-auto object-contain rounded-md ${animate ? 'brand-logo-animate' : ''} ${variant === 'light' ? 'shadow-sm' : ''} ${className}`}
  />
);

export default BrandLogo;
