/** Drop-in for next/navigation hooks using react-router. */
import { useLocation, useNavigate } from "react-router-dom";

export function usePathname() {
  return useLocation().pathname;
}

export function useRouter() {
  const nav = useNavigate();
  return {
    push: (to: string) => nav(to),
    replace: (to: string) => nav(to, { replace: true }),
    back: () => nav(-1),
  };
}
