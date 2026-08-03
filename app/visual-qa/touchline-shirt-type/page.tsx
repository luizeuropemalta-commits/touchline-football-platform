"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { touchlineArenaClubTemplateForCard } from "@/lib/touchlineArena/card-rules";
import { touchlineArenaDemoHref } from "@/lib/touchlineArena/arena-navigation";
import {
  TOUCHLINE_HOME_SHIRT_NUMBER_PALETTES,
  touchlineShirtNumberPaletteForClub,
  type TouchLineShirtNumberPalette,
} from "@/lib/touchlineArena/shirt-number-colors";

import styles from "./shirt-type.module.css";

type FamilyId = "crown" | "velocity" | "forge" | "heritage" | "axis";
type MarkPlacement = "middle" | "upper";
type MarkAnchor = { x: number; y: number; scale: number };
type MarkAnchorMap = Record<string, MarkAnchor>;

type TypeSample = {
  id: FamilyId;
  family: string;
  preset: string;
  club: string;
  player: string;
  number: string;
  marketValue: string;
  tierValue: number;
  country: string;
  flag: string;
  note: string;
};

const DIGIT_PATHS: Record<string, string> = {
  "0": "M35 3C12 3 3 20 3 50S12 97 35 97 67 80 67 50 58 3 35 3ZM35 23C45 23 47 32 47 50S45 77 35 77 23 68 23 50 25 23 35 23Z",
  "1": "M28 5H51V97H28V31L15 40 5 22 28 5Z",
  "2": "M8 32C8 13 19 3 37 3 57 3 67 15 67 32 67 47 58 57 47 66L31 78H68V97H4V77L38 50C45 44 48 39 48 32 48 24 44 20 37 20 29 20 26 25 26 34H8V32Z",
  "3": "M7 29C7 12 18 3 37 3 56 3 66 14 66 31 66 41 61 48 53 52 62 56 68 64 68 75 68 91 56 99 37 99 17 99 6 89 6 71H25C25 79 29 83 37 83 45 83 49 80 49 73 49 65 44 62 33 62H26V44H34C43 44 47 41 47 33 47 24 43 20 36 20 29 20 25 24 25 31H7V29Z",
  "4": "M40 4H64V61H70V80H64V97H44V80H2V59L40 4ZM44 34L25 61H44V34Z",
  "5": "M9 4H66V23H27V39C31 36 36 34 42 34 59 34 68 46 68 65V71C68 89 57 99 37 99 18 99 7 89 6 72H25C26 79 30 82 37 82 45 82 49 78 49 69V65C49 56 45 52 37 52 30 52 26 56 25 62H7L9 4Z",
  "6": "M64 25H45C44 20 40 18 34 18 25 18 21 25 21 39V43C26 38 32 35 40 35 58 35 68 47 68 66V70C68 88 56 99 37 99 15 99 3 85 3 58V42C3 16 14 3 36 3 52 3 62 11 64 25ZM37 52C28 52 23 57 23 67V70C23 79 28 83 37 83 45 83 49 79 49 70V67C49 57 45 52 37 52Z",
  "7": "M3 4H68V24L37 97H14L45 23H24V35H3V4Z",
  "8": "M36 3C55 3 66 13 66 30 66 40 61 47 53 52 63 56 68 64 68 76 68 92 57 100 36 100S4 92 4 76C4 64 9 56 19 52 11 47 6 40 6 30 6 13 17 3 36 3ZM36 19C28 19 24 23 24 31 24 39 28 43 36 43 44 43 48 39 48 31 48 23 44 19 36 19ZM36 60C27 60 23 64 23 72 23 80 27 84 36 84 45 84 49 80 49 72 49 64 45 60 36 60Z",
  "9": "M36 3C15 3 5 16 5 37 5 57 16 68 33 68 39 68 44 66 48 63V97H67V35C67 14 56 3 36 3ZM36 20C44 20 48 26 48 36S44 52 36 52 24 46 24 36 28 20 36 20Z",
};

const FAMILY_TRANSFORMS: Record<FamilyId, string> = {
  crown: "translate(0 0)",
  velocity: "translate(9 0) skewX(-8)",
  forge: "translate(6 0) scale(.84 1)",
  heritage: "translate(2 0) scale(.95 1)",
  axis: "translate(-4 0) scale(1.12 1)",
};

const SAMPLES: TypeSample[] = [
  {
    id: "crown",
    family: "TouchLine Crown",
    preset: "TouchLineChelsea",
    club: "Chelsea FC",
    player: "Cole Palmer",
    number: "10",
    marketValue: "€120M",
    tierValue: 120_000_000,
    country: "ENG",
    flag: "/touchlineArena/shared/country-flags-4x3/gb-eng.svg",
    note: "Ampla e nobre",
  },
  {
    id: "velocity",
    family: "TouchLine Velocity",
    preset: "TouchLineManchesterCity",
    club: "Manchester City",
    player: "Erling Haaland",
    number: "9",
    marketValue: "€180M",
    tierValue: 180_000_000,
    country: "NOR",
    flag: "/touchlineArena/shared/country-flags-4x3/no.svg",
    note: "Rápida e inclinada",
  },
  {
    id: "forge",
    family: "TouchLine Forge",
    preset: "TouchLineBournemouth",
    club: "AFC Bournemouth",
    player: "Tyler Adams",
    number: "12",
    marketValue: "€18M",
    tierValue: 18_000_000,
    country: "USA",
    flag: "/touchlineArena/shared/country-flags-4x3/us.svg",
    note: "Compacta e robusta",
  },
  {
    id: "heritage",
    family: "TouchLine Heritage",
    preset: "TouchLineLiverpool",
    club: "Liverpool FC",
    player: "Mohamed Salah",
    number: "11",
    marketValue: "€50M",
    tierValue: 50_000_000,
    country: "EGY",
    flag: "/touchlineArena/shared/country-flags-4x3/eg.svg",
    note: "Clássica e solene",
  },
  {
    id: "axis",
    family: "TouchLine Axis",
    preset: "TouchLineNewcastle",
    club: "Newcastle United",
    player: "Anthony Gordon",
    number: "10",
    marketValue: "€65M",
    tierValue: 65_000_000,
    country: "ENG",
    flag: "/touchlineArena/shared/country-flags-4x3/gb-eng.svg",
    note: "Larga e geométrica",
  },
];

const TL_SHIELD_PATH = "M90 18L145 43V108L90 157L35 108V43L90 18Z";
const TL_T_PATH = "M48 50H103V68H85V124H65V68H48V50Z";
const TL_L_PATH = "M102 50H123V107L141 95V116L102 141V50Z";
const TL_L_ACCENT_PATH = "M89 122L102 114V139L89 147V122Z";
const TL_MARK_SOURCE_CENTER = { x: 90, y: 88 };
const TL_MARK_SOURCE_SCALE = 0.12;
const EDITOR_VIEWBOX = { x: -25, y: -20, width: 120, height: 150 };
const EDITOR_STORAGE_KEY = "touchline-shirt-number-mark-anchors-v2";

const MARK_ANCHORS: Record<
  MarkPlacement,
  MarkAnchorMap
> = {
  middle: {
    "0": { x: 57, y: 51, scale: 0.58 },
    "1": { x: 40, y: 52, scale: 0.58 },
    "2": { x: 45, y: 54, scale: 0.58 },
    "3": { x: 57, y: 52, scale: 0.58 },
    "4": { x: 35, y: 65, scale: 0.58 },
    "5": { x: 18, y: 56, scale: 0.58 },
    "6": { x: 18, y: 55, scale: 0.58 },
    "7": { x: 37, y: 54, scale: 0.58 },
    "8": { x: 36, y: 52, scale: 0.58 },
    "9": { x: 57, y: 50, scale: 0.58 },
  },
  upper: {
    "0": { x: 35, y: 13, scale: 0.56 },
    "1": { x: 40, y: 24, scale: 0.56 },
    "2": { x: 37, y: 13, scale: 0.56 },
    "3": { x: 37, y: 13, scale: 0.56 },
    "4": { x: 52, y: 23, scale: 0.56 },
    "5": { x: 37, y: 13, scale: 0.56 },
    "6": { x: 36, y: 13, scale: 0.56 },
    "7": { x: 36, y: 13, scale: 0.56 },
    "8": { x: 36, y: 13, scale: 0.56 },
    "9": { x: 36, y: 13, scale: 0.56 },
  },
};

function displayName(name: string) {
  return name.split(" ").at(-1)?.toUpperCase() || name.toUpperCase();
}

function TouchLineDigit({
  digit,
  family,
  fill,
  outline,
  index,
  placement = "middle",
  markOverride,
  onMarkChange,
}: {
  digit: string;
  family: FamilyId;
  fill: string;
  outline: string;
  index: number;
  placement?: MarkPlacement;
  markOverride?: MarkAnchor;
  onMarkChange?: (anchor: MarkAnchor) => void;
}) {
  const draggingRef = useRef(false);
  const maskId = `touchline-digit-${family}-${digit}-${index}`;
  const path = DIGIT_PATHS[digit] || DIGIT_PATHS["0"];
  const mark = markOverride || MARK_ANCHORS[placement][digit] || MARK_ANCHORS[placement]["0"];
  const markScale = mark.scale * (family === "forge" ? 0.9 : 1);
  const isEditable = Boolean(onMarkChange);
  const markTransform =
    `translate(${mark.x} ${mark.y}) ` +
    `scale(${markScale * TL_MARK_SOURCE_SCALE}) ` +
    `translate(${-TL_MARK_SOURCE_CENTER.x} ${-TL_MARK_SOURCE_CENTER.y})`;

  function updateMark(event: ReactPointerEvent<SVGGElement>) {
    if (!onMarkChange) return;
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return;
    const bounds = svg.getBoundingClientRect();
    const rawX =
      EDITOR_VIEWBOX.x +
      ((event.clientX - bounds.left) / bounds.width) * EDITOR_VIEWBOX.width;
    const rawY =
      EDITOR_VIEWBOX.y +
      ((event.clientY - bounds.top) / bounds.height) * EDITOR_VIEWBOX.height;
    const x = Math.max(0, Math.min(70, rawX));
    const y = Math.max(0, Math.min(100, rawY));
    onMarkChange({
      ...mark,
      x: Math.round(x * 10) / 10,
      y: Math.round(y * 10) / 10,
    });
  }

  if (isEditable) {
    return (
      <svg
        className={styles.digit}
        viewBox={`${EDITOR_VIEWBOX.x} ${EDITOR_VIEWBOX.y} ${EDITOR_VIEWBOX.width} ${EDITOR_VIEWBOX.height}`}
        preserveAspectRatio="xMidYMid meet"
        aria-label={`Número ${digit}`}
        role="img"
      >
        <text
          className={styles.editorDigitText}
          x="35"
          y="95"
          textAnchor="middle"
          fill={fill}
          stroke={outline}
          strokeWidth="1.8"
          paintOrder="stroke fill"
        >
          {digit}
        </text>
        <g
          className={styles.editableMark}
          transform={`translate(${mark.x} ${mark.y})`}
          opacity=".72"
          onPointerDown={(event) => {
            draggingRef.current = true;
            event.currentTarget.setPointerCapture(event.pointerId);
            updateMark(event);
          }}
          onPointerMove={(event) => {
            if (draggingRef.current) updateMark(event);
          }}
          onPointerUp={(event) => {
            draggingRef.current = false;
            event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onPointerCancel={() => {
            draggingRef.current = false;
          }}
        >
          <circle r="15" fill="transparent" />
          <g
            transform={
              `scale(${markScale * TL_MARK_SOURCE_SCALE}) ` +
              `translate(${-TL_MARK_SOURCE_CENTER.x} ${-TL_MARK_SOURCE_CENTER.y})`
            }
          >
            <path
              d={TL_SHIELD_PATH}
              fill="none"
              stroke={outline}
              strokeWidth="8"
              strokeLinejoin="round"
            />
            <path d={TL_T_PATH} fill={outline} />
            <path d={TL_L_PATH} fill={outline} />
            <path d={TL_L_ACCENT_PATH} fill={outline} />
          </g>
        </g>
      </svg>
    );
  }

  return (
    <svg
      className={styles.digit}
      viewBox="0 0 70 100"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <defs>
        <clipPath id={`${maskId}-clip`}>
          <g transform={FAMILY_TRANSFORMS[family]}>
            <path d={path} fillRule="evenodd" clipRule="evenodd" />
          </g>
        </clipPath>
        <mask id={maskId} maskUnits="userSpaceOnUse">
          <rect width="70" height="100" fill="#000" />
          <g transform={FAMILY_TRANSFORMS[family]}>
            <path d={path} fill="#fff" fillRule="evenodd" clipRule="evenodd" />
          </g>
          <g transform={markTransform}>
            <path
              d={TL_SHIELD_PATH}
              fill="none"
              stroke="#000"
              strokeWidth="8"
              strokeLinejoin="round"
            />
            <path d={TL_T_PATH} fill="#000" />
            <path d={TL_L_PATH} fill="#000" />
            <path d={TL_L_ACCENT_PATH} fill="#000" />
          </g>
          {family === "forge" ? (
            <>
              <path d="M0 46H11L15 50 11 54H0V46Z" fill="#000" />
              <path d="M70 46H59L55 50 59 54H70V46Z" fill="#000" />
            </>
          ) : null}
        </mask>
      </defs>

      <rect width="70" height="100" fill={fill} mask={`url(#${maskId})`} />
      <g transform={FAMILY_TRANSFORMS[family]}>
        <path
          d={path}
          fill="none"
          stroke={outline}
          strokeWidth={family === "heritage" ? 2.8 : 2.2}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </g>
      <g
        className={isEditable ? styles.editableMark : undefined}
        transform={`translate(${mark.x} ${mark.y})`}
        clipPath={isEditable ? undefined : `url(#${maskId}-clip)`}
        opacity=".62"
        onPointerDown={(event) => {
          if (!onMarkChange) return;
          draggingRef.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
          updateMark(event);
        }}
        onPointerMove={(event) => {
          if (draggingRef.current) updateMark(event);
        }}
        onPointerUp={(event) => {
          draggingRef.current = false;
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => {
          draggingRef.current = false;
        }}
      >
        {isEditable ? <circle r="15" fill="transparent" /> : null}
        <g
          transform={
            `scale(${markScale * TL_MARK_SOURCE_SCALE}) ` +
            `translate(${-TL_MARK_SOURCE_CENTER.x} ${-TL_MARK_SOURCE_CENTER.y})`
          }
        >
          <path
            d={TL_SHIELD_PATH}
            fill="none"
            stroke={outline}
            strokeWidth="8"
            strokeLinejoin="round"
          />
          <path d={TL_T_PATH} fill={outline} />
          <path d={TL_L_PATH} fill={outline} />
          <path d={TL_L_ACCENT_PATH} fill={outline} />
        </g>
      </g>
      {family === "crown" ? (
        <path d="M11 7H59" fill="none" stroke={outline} strokeWidth="2" opacity=".7" />
      ) : null}
    </svg>
  );
}

function TouchLineNumber({
  sample,
  palette,
}: {
  sample: TypeSample;
  palette: TouchLineShirtNumberPalette;
}) {
  return (
    <div className={`${styles.number} ${styles[sample.id]}`} aria-label={`Camisa ${sample.number}`}>
      {sample.number.split("").map((digit, index) => (
        <TouchLineDigit
          key={`${sample.id}-${digit}-${index}`}
          digit={digit}
          family={sample.id}
          fill={palette.fill}
          outline={palette.outline}
          index={index}
        />
      ))}
    </div>
  );
}

function SampleCard({ sample, index }: { sample: TypeSample; index: number }) {
  const palette = touchlineShirtNumberPaletteForClub(sample.club);
  const template =
    touchlineArenaClubTemplateForCard(sample.club, sample.tierValue) ||
    "/touchlineArena/cards/templates/clubs/Manchester%20City/market-tiers/diamond-gold.png";

  return (
    <article className={styles.sample}>
      <div className={styles.sampleHeading}>
        <span>Família {String(index + 1).padStart(2, "0")}</span>
        <strong>{sample.family}</strong>
        <small>{sample.note}</small>
      </div>

      <div className={styles.cardFrame}>
        <img className={styles.cardArt} src={template} alt="" />

        <div className={styles.cardFlag}>
          <span>Nat</span>
          <img src={sample.flag} alt="" />
          <b>{sample.country}</b>
        </div>

        <div className={styles.cardPoints}>
          <span>Points</span>
          <b>0.0</b>
        </div>

        <div
          className={`${styles.playerName} ${styles[`name${sample.id}`]}`}
          style={{ color: palette.fill, WebkitTextStrokeColor: palette.outline }}
        >
          {displayName(sample.player)}
        </div>

        <TouchLineNumber sample={sample} palette={palette} />

        <div
          className={styles.shirtClub}
          style={{ color: palette.fill, WebkitTextStrokeColor: palette.outline }}
        >
          {sample.club}
        </div>

        <div className={styles.valueRow}>
          <div>
            <span>Market value</span>
            <strong>{sample.marketValue}</strong>
          </div>
          <img src="/touchlineArena/brand/tl-shield-lime.svg" alt="" />
          <div>
            <span>Card value</span>
            <strong>{sample.marketValue.replace("M", "")}</strong>
          </div>
        </div>
      </div>

      <div className={styles.preset}>
        <span>Preset</span>
        <code>{palette.preset}</code>
      </div>
    </article>
  );
}

function DigitCalibrationStrip({
  placement,
  title,
  description,
  indexOffset,
  anchors,
  onAnchorChange,
}: {
  placement: MarkPlacement;
  title: string;
  description: string;
  indexOffset: number;
  anchors?: MarkAnchorMap;
  onAnchorChange?: (digit: string, anchor: MarkAnchor) => void;
}) {
  return (
    <div className={styles.calibrationOption}>
      <div>
        <strong>{title}</strong>
        <span>{description}</span>
      </div>
      <div className={`${styles.digitStrip} ${onAnchorChange ? styles.editableDigitStrip : ""}`}>
        {Object.keys(DIGIT_PATHS).map((digit, index) => (
          <div className={styles.digitCalibrationCell} key={digit}>
            <TouchLineDigit
              digit={digit}
              family="axis"
              fill="#ffffff"
              outline="#050505"
              index={index + indexOffset}
              placement={placement}
              markOverride={anchors?.[digit]}
              onMarkChange={
                onAnchorChange ? (anchor) => onAnchorChange(digit, anchor) : undefined
              }
            />
            {!onAnchorChange ? <span>{digit}</span> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function DigitCalibration() {
  const [editableAnchors, setEditableAnchors] = useState<MarkAnchorMap>(() => ({
    ...MARK_ANCHORS.middle,
  }));
  const [selectedDigit, setSelectedDigit] = useState("0");
  const [saveState, setSaveState] = useState("Arraste os símbolos com o mouse.");

  useEffect(() => {
    const saved = window.localStorage.getItem(EDITOR_STORAGE_KEY);
    if (!saved) return;
    const frame = window.requestAnimationFrame(() => {
      try {
        setEditableAnchors(JSON.parse(saved) as MarkAnchorMap);
        setSaveState("Posições salvas carregadas.");
      } catch {
        window.localStorage.removeItem(EDITOR_STORAGE_KEY);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  function updateAnchor(digit: string, anchor: MarkAnchor) {
    setSelectedDigit(digit);
    setEditableAnchors((current) => ({ ...current, [digit]: anchor }));
    setSaveState(`Número ${digit} ajustado. Clique em Salvar posições.`);
  }

  function updateSelectedScale(scale: number) {
    setEditableAnchors((current) => ({
      ...current,
      [selectedDigit]: {
        ...(current[selectedDigit] || MARK_ANCHORS.middle[selectedDigit]),
        scale,
      },
    }));
    setSaveState(`Tamanho do símbolo no número ${selectedDigit} ajustado.`);
  }

  function saveAnchors() {
    window.localStorage.setItem(EDITOR_STORAGE_KEY, JSON.stringify(editableAnchors));
    setSaveState("Posições salvas. Agora elas não se perdem ao atualizar a página.");
  }

  function resetAnchors() {
    const reset = { ...MARK_ANCHORS.middle };
    setEditableAnchors(reset);
    window.localStorage.removeItem(EDITOR_STORAGE_KEY);
    setSaveState("Posições restauradas para o padrão.");
  }

  return (
    <section className={styles.calibration} aria-labelledby="digit-calibration-title">
      <div className={styles.sectionHeading}>
        <div>
          <span className={styles.eyebrow}>Precisão vetorial</span>
          <h2 id="digit-calibration-title">Alinhamento dos algarismos</h2>
        </div>
        <p>Uma âncora óptica por algarismo. A marca mantém a mesma altura visual de 0 a 9.</p>
      </div>

      <div className={styles.calibrationOptions}>
        <div className={styles.editorActions}>
          <span aria-live="polite">{saveState}</span>
          <label>
            <b>Tamanho no número {selectedDigit}</b>
            <input
              type="range"
              min="0.35"
              max="0.85"
              step="0.01"
              value={editableAnchors[selectedDigit]?.scale ?? 0.58}
              onChange={(event) => updateSelectedScale(Number(event.target.value))}
            />
            <output>{Math.round((editableAnchors[selectedDigit]?.scale ?? 0.58) * 100)}%</output>
          </label>
          <button type="button" onClick={resetAnchors}>Restaurar</button>
          <button type="button" onClick={saveAnchors}>Salvar posições</button>
        </div>
        <DigitCalibrationStrip
          placement="middle"
          title="Opção A · Editável"
          description="Clique e arraste cada símbolo até a posição exata que você deseja."
          indexOffset={20}
          anchors={editableAnchors}
          onAnchorChange={updateAnchor}
        />
      </div>
    </section>
  );
}

function PaletteDirectory() {
  return (
    <section className={styles.paletteDirectory} aria-labelledby="palette-directory-title">
      <div className={styles.sectionHeading}>
        <div>
          <span className={styles.eyebrow}>Camisas principais 2026/27</span>
          <h2 id="palette-directory-title">Cores dos 20 clubes</h2>
        </div>
        <p>
          A primeira cor segue a referência da camisa. O contorno é um tratamento digital
          TouchLine para preservar a leitura dentro do card.
        </p>
      </div>

      <div className={styles.paletteGrid}>
        {TOUCHLINE_HOME_SHIRT_NUMBER_PALETTES.map((palette) => (
          <article className={styles.paletteItem} key={palette.slug}>
            <div
              className={styles.paletteNumber}
              style={{
                color: palette.fill,
                WebkitTextStrokeColor: palette.outline,
              }}
            >
              10
            </div>
            <div className={styles.paletteCopy}>
              <strong>{palette.clubName}</strong>
              <span>{palette.preset}</span>
              <small>{palette.evidence.replaceAll("-", " ")}</small>
            </div>
            <div className={styles.swatches} aria-label={`Cores de ${palette.clubName}`}>
              <i style={{ background: palette.fill }} />
              <i style={{ background: palette.outline }} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export default function TouchLineShirtTypeLabPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>TouchLine Design Lab</span>
          <h1>Tipografia das camisas</h1>
          <p>Cinco famílias vetoriais autorais. Cada algarismo contém uma marca TouchLine vazada.</p>
        </div>
        <Link href={touchlineArenaDemoHref("pt-BR")}>Voltar para Arena</Link>
      </header>

      <section className={styles.statusBar} aria-label="Estado do estudo">
        <div>
          <span>Amostras</span>
          <strong>5</strong>
        </div>
        <div>
          <span>Presets de clube</span>
          <strong>20</strong>
        </div>
        <div>
          <span>Marca vazada</span>
          <strong>1 por algarismo</strong>
        </div>
        <div>
          <span>Estado</span>
          <strong>Protótipo</strong>
        </div>
      </section>

      <DigitCalibration />

      <section className={styles.grid} aria-label="Comparação das famílias tipográficas">
        {SAMPLES.map((sample, index) => (
          <SampleCard key={sample.id} sample={sample} index={index} />
        ))}
      </section>

      <PaletteDirectory />
    </main>
  );
}
