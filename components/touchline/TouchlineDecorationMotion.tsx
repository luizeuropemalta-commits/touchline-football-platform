"use client";

import { useEffect } from "react";
import { observeVisibleDecorationMotion } from "@/lib/touchlineArena/visible-decoration-motion";

export default function TouchlineDecorationMotion() {
  useEffect(() => observeVisibleDecorationMotion(), []);
  return null;
}
