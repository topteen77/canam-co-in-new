import React from 'react';

interface BrandLogoProps {
  className?: string;
  heightClass?: string;
  alt?: string;
  variant?: 'dark' | 'light';
}

const BrandLogo: React.FC<BrandLogoProps> = ({
  className = '',
  heightClass = 'h-10',
  alt = 'Canam CRM',
  variant = 'dark',
}) => (
  <img
    src={variant === 'light' ? '/canam-crm-logo-light.png' : '/canam-crm-logo.png'}
    alt={alt}
    className={`${heightClass} w-auto object-contain ${className}`}
  />
);

export default BrandLogo;
