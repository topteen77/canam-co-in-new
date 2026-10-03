import React, { useEffect } from 'react';
import { initPwaInstall } from '../services/pwaInstall';

/** Keeps the install prompt captured. The Download App action lives in User Profile. */
const PWAInstallPrompt: React.FC = () => {
  useEffect(() => {
    initPwaInstall();
  }, []);

  return null;
};

export default PWAInstallPrompt;
