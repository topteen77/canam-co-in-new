import React from 'react';
import BrandLogo from './BrandLogo';

interface PageLoaderProps {
  label?: string;
  fullScreen?: boolean;
}

const PageLoader: React.FC<PageLoaderProps> = ({ label = 'Loading…', fullScreen = false }) => {
  const body = (
    <div className="flex flex-col items-center justify-center gap-4 text-center px-6">
      <div className="relative flex items-center justify-center">
        <span className="page-loader-ring" />
        <span className="page-loader-ring page-loader-ring-delay" />
        <div className="relative z-10 rounded-2xl bg-slate-950/90 px-5 py-3 shadow-xl shadow-cyan-500/10">
          <BrandLogo heightClass="h-9 sm:h-11" />
        </div>
      </div>
      <div className="w-40 h-1 rounded-full bg-slate-800 overflow-hidden">
        <span className="page-loader-bar" />
      </div>
      <p className="text-sm font-medium text-slate-300">{label}</p>
    </div>
  );

  if (fullScreen) {
    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
        {body}
      </div>
    );
  }

  return <div className="flex justify-center items-center py-16">{body}</div>;
};

export default PageLoader;
