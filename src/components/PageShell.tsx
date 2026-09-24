import { motion } from "framer-motion";

/** Was app/template.tsx in Next. Wraps every route with the same entrance animation. */
export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <motion.main
      initial={{ opacity: 0, y: 16, filter: "blur(8px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="px-5 pt-7 pb-44"
    >
      {children}
    </motion.main>
  );
}
