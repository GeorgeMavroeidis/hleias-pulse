import { useState } from "react";

interface Props extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt: string;
  rounded?: string;
  gradientFallback?: string;
}

export function ImageBox({
  src,
  alt,
  className = "",
  rounded = "rounded-2xl",
  gradientFallback,
  width = 800,
  height = 600,
  ...rest
}: Props) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const fallback =
    gradientFallback ?? "linear-gradient(135deg,#7FC8DE 0%,#0E3A5B 60%,#241B3D 100%)";
  return (
    <div
      className={`relative overflow-hidden ${rounded} ${className}`}
      style={{ background: fallback }}
    >
      {!failed && (
        <img
          src={src}
          alt={alt}
          width={width}
          height={height}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={`h-full w-full object-cover transition-opacity duration-500 ${loaded ? "opacity-100" : "opacity-0"}`}
          {...rest}
        />
      )}
      {!loaded && !failed && (
        <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-black/10 to-black/20" />
      )}
    </div>
  );
}
