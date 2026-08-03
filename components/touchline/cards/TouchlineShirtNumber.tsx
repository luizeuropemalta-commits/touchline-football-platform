"use client";

import { useId } from "react";
import {
  normalizeTouchLineShirtNumber,
  TOUCHLINE_DIGIT_MARK_ANCHORS,
  TOUCHLINE_MARK_PATHS,
  TOUCHLINE_SHIRT_DIGIT_ASSETS,
  TOUCHLINE_SHIRT_DIGIT_IMAGE_BOXES,
  type TouchLineShirtDigit,
} from "@/lib/touchlineArena/shirt-number-art";

type TouchlineShirtNumberProps = {
  value: string | number | null | undefined;
  fill: string;
  outline: string;
  outlineWidth?: number;
};

function TouchlineDigit({
  digit,
  fill,
  outline,
  outlineWidth,
  maskId,
  outlineFilterId,
}: {
  digit: TouchLineShirtDigit;
  fill: string;
  outline: string;
  outlineWidth: number;
  maskId: string;
  outlineFilterId: string;
}) {
  const digitAsset = TOUCHLINE_SHIRT_DIGIT_ASSETS[digit];
  const imageBox = TOUCHLINE_SHIRT_DIGIT_IMAGE_BOXES[digit];
  const mark = TOUCHLINE_DIGIT_MARK_ANCHORS[digit];
  const markTransform = `translate(${mark.x} ${mark.y}) scale(${mark.scale}) translate(-90 -88)`;

  return (
    <svg
      viewBox="0 0 70 100"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      focusable="false"
      style={{ display: "block", width: "100%", height: "100%", overflow: "visible" }}
    >
      <defs>
        <mask
          id={maskId}
          maskUnits="userSpaceOnUse"
          x="-4"
          y="-4"
          width="78"
          height="108"
          style={{ maskType: "luminance" }}
        >
          <rect x="-4" y="-4" width="78" height="108" fill="#000" />
          <image
            href={digitAsset}
            x={imageBox.x}
            y={imageBox.y}
            width={imageBox.width}
            height={imageBox.height}
            preserveAspectRatio="none"
          />
          <g transform={markTransform} fill="#000" stroke="#000" strokeLinejoin="round">
            <path d={TOUCHLINE_MARK_PATHS.shield} fill="none" strokeWidth="8" />
            <path d={TOUCHLINE_MARK_PATHS.t} stroke="none" />
            <path d={TOUCHLINE_MARK_PATHS.l} stroke="none" />
            <path d={TOUCHLINE_MARK_PATHS.accent} stroke="none" />
          </g>
        </mask>
        <filter
          id={outlineFilterId}
          x="-18%"
          y="-12%"
          width="136%"
          height="124%"
          colorInterpolationFilters="sRGB"
        >
          <feMorphology in="SourceAlpha" operator="dilate" radius={outlineWidth} result="expanded" />
          <feComposite in="expanded" in2="SourceAlpha" operator="out" result="outerRing" />
          <feFlood floodColor={outline} result="outlineColor" />
          <feComposite in="outlineColor" in2="outerRing" operator="in" result="outlineShape" />
          <feMerge>
            <feMergeNode in="outlineShape" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g filter={`url(#${outlineFilterId})`}>
        <rect
          x="0"
          y="0"
          width="70"
          height="100"
          fill={fill}
          mask={`url(#${maskId})`}
        />
      </g>
    </svg>
  );
}

export function TouchlineShirtNumber({ value, fill, outline, outlineWidth = 1.45 }: TouchlineShirtNumberProps) {
  const instanceId = useId().replace(/:/g, "");
  const normalized = normalizeTouchLineShirtNumber(value);
  const digits = normalized.split("") as TouchLineShirtDigit[];

  if (!digits.length) {
    return (
      <span
        aria-label="Shirt number unavailable"
        style={{ color: fill, fontSize: "64%", fontWeight: 950, lineHeight: 1 }}
      >
        --
      </span>
    );
  }

  return (
    <span
      role="img"
      aria-label={`Shirt number ${normalized}`}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        height: "100%",
        gap: 0,
        filter: "drop-shadow(0 4px 5px rgba(0,0,0,.42))",
        pointerEvents: "none",
      }}
    >
      {digits.map((digit, index) => (
        <span
          key={`${digit}-${index}`}
          style={{
            display: "block",
            flex: "0 0 auto",
            width: digits.length === 1 ? "52%" : "50%",
            height: "100%",
          }}
        >
          <TouchlineDigit
            digit={digit}
            fill={fill}
            outline={outline}
            outlineWidth={outlineWidth}
            maskId={`touchline-shirt-number-${instanceId}-${index}`}
            outlineFilterId={`touchline-shirt-number-outline-${instanceId}-${index}`}
          />
        </span>
      ))}
    </span>
  );
}
