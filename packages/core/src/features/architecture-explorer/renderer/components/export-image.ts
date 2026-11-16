/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { ExportPalette } from "../graph/export-svg";

const cssVar = (style: CSSStyleDeclaration, name: string, fallback: string) =>
  style.getPropertyValue(name).trim() || fallback;

/** The export colours, read from the active theme. */
export const paletteFromTheme = (element: Element = document.documentElement): ExportPalette => {
  const style = getComputedStyle(element);

  return {
    background: cssVar(style, "--mainBackground", "#1e2124"),
    surface: cssVar(style, "--contentColor", "#262b2f"),
    border: cssVar(style, "--borderColor", "#4c5053"),
    text: cssVar(style, "--textColorAccent", "#ffffff"),
    textMuted: cssVar(style, "--textColorTertiary", "#a0a0a0"),
    accent: cssVar(style, "--primary", "#3d90ce"),
    health: {
      healthy: cssVar(style, "--colorSuccess", "#43a047"),
      warning: cssVar(style, "--colorWarning", "#ff9800"),
      critical: cssVar(style, "--colorError", "#ce3933"),
      missing: cssVar(style, "--colorError", "#ce3933"),
      unknown: cssVar(style, "--textColorTertiary", "#a0a0a0"),
    },
  };
};

/** Largest side of an exported PNG, below what Chromium's canvas allows. */
const maxCanvasSide = 16_000;

/** Renders an SVG document to a PNG, at twice its size when that fits. */
export const svgToPng = (svg: string, width: number, height: number): Promise<Blob> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    const scale = Math.min(2, maxCanvasSide / Math.max(width, height, 1));

    image.onload = () => {
      const canvas = document.createElement("canvas");

      canvas.width = Math.max(1, Math.floor(width * scale));
      canvas.height = Math.max(1, Math.floor(height * scale));

      const context = canvas.getContext("2d");

      if (!context) {
        reject(new Error("No 2D canvas context"));

        return;
      }

      context.scale(scale, scale);
      context.drawImage(image, 0, 0, width, height);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("The image could not be encoded"))),
        "image/png",
      );
    };
    image.onerror = () => reject(new Error("The SVG could not be rendered"));
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
