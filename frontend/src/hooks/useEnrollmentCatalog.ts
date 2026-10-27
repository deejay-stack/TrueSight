import { useCallback, useEffect, useRef, useState } from 'react';
import { lmsRequest } from '../services/lmsService';
import type { EnrollmentCatalog } from '../utils/enrollmentFlow';

export function useEnrollmentCatalog() {
  const [catalog, setCatalog] = useState<EnrollmentCatalog | null>(null);
  const [error, setError] = useState('');
  const mounted = useRef(false);
  const request = useRef(0);
  const refresh = useCallback(() => {
    const generation = ++request.current;
    return lmsRequest<EnrollmentCatalog>('/eligible').then(data => {
      if (mounted.current && generation === request.current) { setCatalog(data); setError(''); }
    }).catch(e => {
      if (mounted.current && generation === request.current) { setCatalog(null); setError(e instanceof Error ? e.message : 'Unable to load academic information.'); }
    });
  }, []);
  useEffect(() => {
    mounted.current = true;
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15000);
    const focus = () => { void refresh(); };
    window.addEventListener('focus',focus);
    return () => { mounted.current=false; clearInterval(timer); window.removeEventListener('focus',focus); };
  }, [refresh]);
  return { catalog,error,refresh };
}
