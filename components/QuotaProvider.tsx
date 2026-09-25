"use client";

/**
 * 额度全局状态：任何页面消耗 AI 额度后，导航栏徽章实时刷新。
 * 初始渲染为 null（服务端/客户端一致），挂载后读取 LocalStorage，避免 hydration 不匹配。
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { loadQuota, QUOTA_EVENT, type QuotaState } from "@/lib/quota";

interface QuotaContextValue {
  quota: QuotaState | null;
  refresh: () => void;
}

const QuotaContext = createContext<QuotaContextValue>({ quota: null, refresh: () => {} });

export function QuotaProvider({ children }: { children: ReactNode }) {
  const [quota, setQuota] = useState<QuotaState | null>(null);

  const refresh = useCallback(() => {
    setQuota(loadQuota());
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener(QUOTA_EVENT, refresh);
    return () => window.removeEventListener(QUOTA_EVENT, refresh);
  }, [refresh]);

  return <QuotaContext.Provider value={{ quota, refresh }}>{children}</QuotaContext.Provider>;
}

export function useQuota(): QuotaContextValue {
  return useContext(QuotaContext);
}
