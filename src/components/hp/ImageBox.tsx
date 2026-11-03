import { useState } from "react";

interface Props extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt: string;
  rounded?: string;
  gradientFallback?: string;
  failedContent?: React.ReactNode;
}

export function ImageBox(props: Props) {
  return <ImageBoxSource key={`${props.src}:${props.srcSet ?? ""}`} {...props} />;
}

function ImageBoxSource({
  src,
  alt,
  className = "",
  rounded = "rounded-2xl",
  gradientFallback,
  failedContent,
  width = 800,
  height = 600,
  onLoad,
  onError,
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
          onLoad={(event) => {
            setLoaded(true);
            onLoad?.(event);
          }}
          onError={(event) => {
            setFailed(true);
            onError?.(event);
          }}
          className={`h-full w-full object-cover hp-image-reveal ${loaded ? "opacity-100" : "opacity-0"}`}
          {...rest}
        />
      )}
      {!loaded && !failed && <div className="hp-image-loading absolute inset-0" />}
      {failed && failedContent && (
        <div className="absolute inset-0 grid place-items-center bg-hp-paper text-xs text-hp-muted">
          {failedContent}
        </div>
      )}
    </div>
  );
}
