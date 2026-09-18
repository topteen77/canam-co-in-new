// components/CompanyBranding.tsx
import React from 'react';

interface CompanyBrandingProps {
  companyId: string;
  companyName: string;
  size?: 'small' | 'medium' | 'large';
  showText?: boolean;
  className?: string;
}

const CompanyBranding: React.FC<CompanyBrandingProps> = ({
  companyId,
  companyName,
  size = 'medium',
  showText = true,
  className = ''
}) => {
  // 🟢 SAFE FIX: Normalize ID to prevent mismatch due to case/whitespace
  const normalizedId = (companyId || '').toLowerCase().trim();
  
  // 🟢 SAFE FIX: Strict size validation - default to 'medium' if invalid
  const safeSize = ['small', 'medium', 'large'].includes(size) ? size : 'medium';

  // Company-specific branding configurations
  const companyBrands: { [key: string]: any } = {
    'iapply': {
      logo: (size: string) => {
        const sizeClasses = {
          small: 'h-7',
          medium: 'h-10',
          large: 'h-14'
        };
        const heightClass = sizeClasses[safeSize as keyof typeof sizeClasses] || sizeClasses.medium;
        return (
          <img
            src="/iapply-canam-logo.png"
            alt="iApply Canam"
            className={`${heightClass} w-auto object-contain rounded-md brand-logo-animate`}
          />
        );
      },
      primaryColor: 'bg-rose-700',
      secondaryColor: 'bg-rose-100',
      textColor: 'text-rose-700',
      accentColor: 'border-rose-500'
    },
    'canam': {
      logo: (size: string) => {
        const sizeClasses = {
          small: 'h-7',
          medium: 'h-10',
          large: 'h-14'
        };
        const heightClass = sizeClasses[safeSize as keyof typeof sizeClasses] || sizeClasses.medium;
        return (
          <img
            src="/iapply-canam-logo.png"
            alt="iApply Canam"
            className={`${heightClass} w-auto object-contain rounded-md brand-logo-animate`}
          />
        );
      },
      primaryColor: 'bg-slate-800',
      secondaryColor: 'bg-slate-100',
      textColor: 'text-slate-800',
      accentColor: 'border-slate-500'
    }
  };

  // 🟢 SAFE FIX: Robust fallback logic
  const brand = companyBrands[normalizedId] || companyBrands['canam'];

  // Debug logging
  console.log('🎨 CompanyBranding Debug:', {
    inputCompanyId: companyId,
    normalizedId,
    resolvedBrand: normalizedId === 'iapply' ? 'iApply' : 'Canam (Default)',
    size: safeSize
  });

  const textSizeClass = {
    small: 'text-sm',
    medium: 'text-lg',
    large: 'text-2xl'
  }[safeSize] || 'text-lg';

  return (
    <div className={`flex items-center ${textSizeClass} ${className}`}>
      {typeof brand.logo === 'function' ? brand.logo(safeSize) : null}
    </div>
  );
};

export default CompanyBranding;