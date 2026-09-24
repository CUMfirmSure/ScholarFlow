/** Drop-in for next/link using react-router. Supports href + className + onClick etc. */
import { Link as RRLink } from "react-router-dom";
import type { ComponentProps } from "react";

type Props = Omit<ComponentProps<typeof RRLink>, "to"> & { href: string };

export default function Link({ href, ...rest }: Props) {
  return <RRLink to={href} {...rest} />;
}
