import { useFeatureSupport } from "@canva/app-hooks";
import {
  Accordion,
  AccordionItem,
  Alert,
  Box,
  Button,
  ColorSelector,
  FormField,
  MultilineInput,
  Rows,
  Scrollable,
  Link,
  Select,
  Switch,
  Text,
  Title,
} from "@canva/app-ui-kit";
import { upload } from "@canva/asset";
import { requestOpenExternalUrl } from "@canva/platform";
import { addElementAtCursor, addElementAtPoint } from "@canva/design";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import { instance, type Viz } from "@viz-js/viz";
import nomnoml from "nomnoml";
import wavedrom from "wavedrom";
import mermaid from "mermaid";
import {
  Diagram as RailroadDiagram,
  Sequence,
  Choice,
  Optional,
  OneOrMore,
  ZeroOrMore,
  Terminal,
  NonTerminal,
  Comment,
  Skip,
  type DiagramItem,
} from "railroad-diagrams";
import * as styles from "styles/components.css";

// Mermaid initialized lazily on first use, re-inits when theme changes
type MermaidTheme = "default" | "dark" | "forest" | "neutral";
let mermaidCurrentTheme: MermaidTheme | null = null;
function ensureMermaidInit(theme: MermaidTheme = "default") {
  if (mermaidCurrentTheme !== theme) {
    mermaid.initialize({ startOnLoad: false, theme });
    mermaidCurrentTheme = theme;
  }
}

// CSS properties to inline from computed styles
const INLINE_STYLE_PROPS = [
  "fill",
  "stroke",
  "stroke-width",
  "stroke-dasharray",
  "stroke-linecap",
  "stroke-linejoin",
  "opacity",
  "fill-opacity",
  "stroke-opacity",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "text-anchor",
  "dominant-baseline",
  "color",
  "rx",
  "ry",
] as const;

/**
 * Walk all elements in an SVG that's currently in the DOM,
 * read their computed styles, and inline them as style attributes.
 * This must be called BEFORE removing <style> tags.
 */
function inlineComputedStyles(svgEl: SVGElement): void {
  const allElements = svgEl.querySelectorAll("*");
  allElements.forEach((el) => {
    if (!(el instanceof SVGElement) && !(el instanceof HTMLElement)) return;
    const computed = window.getComputedStyle(el);
    const inlined: string[] = [];
    for (const prop of INLINE_STYLE_PROPS) {
      const val = computed.getPropertyValue(prop);
      if (val && val !== "none" && val !== "normal" && val !== "0px") {
        inlined.push(`${prop}:${val}`);
      }
    }
    if (inlined.length > 0) {
      const existing = el.getAttribute("style") || "";
      el.setAttribute(
        "style",
        existing ? `${existing};${inlined.join(";")}` : inlined.join(";")
      );
    }
  });
}

/**
 * Sanitize an SVG element for canvas rasterization.
 * Must be called AFTER inlineComputedStyles (while SVG is in DOM).
 * Removes foreignObject elements (which taint the canvas)
 * and <style> tags (now redundant after inlining).
 */
function sanitizeSvgForCanvas(svgEl: SVGElement): void {
  // Remove all foreignObject elements — they taint the canvas
  const foreignObjects = svgEl.querySelectorAll("foreignObject");
  foreignObjects.forEach((fo) => {
    // Try to extract text content as a fallback <text> element
    const textContent = fo.textContent?.trim();
    if (textContent) {
      const textEl = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "text"
      );
      const x = fo.getAttribute("x") || "0";
      const y = fo.getAttribute("y") || "0";
      const foWidth = parseFloat(
        fo.getAttribute("width") || "100"
      );
      textEl.setAttribute("x", String(parseFloat(x) + foWidth / 2));
      textEl.setAttribute(
        "y",
        String(parseFloat(y) + 20)
      );
      textEl.setAttribute("text-anchor", "middle");
      textEl.setAttribute("font-size", "14");
      textEl.setAttribute("font-family", "sans-serif");
      textEl.textContent = textContent;
      fo.parentNode?.replaceChild(textEl, fo);
    } else {
      fo.remove();
    }
  });

  // Remove <style> tags (styles are already inlined)
  const styleTags = svgEl.querySelectorAll("style");
  styleTags.forEach((styleTag) => styleTag.remove());
}

/**
 * Rasterize a live DOM SVG element to a PNG data URL.
 * 1. Inline computed styles (while SVG is still in the DOM)
 * 2. Clone the SVG
 * 3. Sanitize the clone (remove foreignObject, style tags)
 * 4. Render to canvas and export as PNG
 */
function svgToPngDataUrl(
  liveSvgEl: SVGElement,
  width: number,
  height: number
): Promise<string> {
  // Step 1: Inline computed styles while SVG is live in the DOM
  inlineComputedStyles(liveSvgEl);

  // Step 2: Clone after inlining so the clone has all styles
  const svgEl = liveSvgEl.cloneNode(true) as SVGElement;

  // Step 3: Sanitize the clone
  sanitizeSvgForCanvas(svgEl);

  // Ensure xmlns is set for standalone SVG
  svgEl.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  svgEl.setAttribute(
    "xmlns:xlink",
    "http://www.w3.org/1999/xlink"
  );

  svgEl.setAttribute("width", String(width));
  svgEl.setAttribute("height", String(height));

  return new Promise((resolve, reject) => {
    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svgEl);

    // Use inline data URL instead of blob URL to avoid tainting
    const dataUrl = `data:image/svg+xml;base64,${btoa(
      unescape(encodeURIComponent(svgString))
    )}`;

    const img = new Image();
    img.onload = () => {
      // Use 4x scale for sharper output on large diagrams
      const scale = 4;
      const canvas = document.createElement("canvas");
      canvas.width = width * scale;
      canvas.height = height * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Could not get canvas context"));
        return;
      }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => {
      reject(new Error("Failed to load SVG as image"));
    };
    img.src = dataUrl;
  });
}

// Diagram syntax types
type DiagramSyntax =
  | "graphviz"
  | "nomnoml"
  | "wavedrom"
  | "mermaid"
  | "railroad";

interface SyntaxConfig {
  defaultCode: string;
  syntaxHelp: { label: string; description: string }[];
  docsUrl: string;
}

// Railroad diagram JSON node types
interface RailroadNode {
  type: string;
  text?: string;
  items?: RailroadNode[];
  default?: number;
  repeat?: RailroadNode;
  skip?: string;
}

function buildRailroadItem(
  node: RailroadNode
): DiagramItem | string {
  switch (node.type) {
    case "Terminal":
      return Terminal(node.text ?? "");
    case "NonTerminal":
      return NonTerminal(node.text ?? "");
    case "Comment":
      return Comment(node.text ?? "");
    case "Skip":
      return Skip();
    case "Sequence":
      return Sequence(
        ...(node.items ?? []).map(buildRailroadItem)
      );
    case "Choice":
      return Choice(
        node.default ?? 0,
        ...(node.items ?? []).map(buildRailroadItem)
      );
    case "Optional":
      return Optional(
        node.items?.[0]
          ? buildRailroadItem(node.items[0])
          : "",
        node.skip
      );
    case "OneOrMore":
      return OneOrMore(
        node.items?.[0]
          ? buildRailroadItem(node.items[0])
          : "",
        node.repeat
          ? buildRailroadItem(node.repeat)
          : undefined
      );
    case "ZeroOrMore":
      return ZeroOrMore(
        node.items?.[0]
          ? buildRailroadItem(node.items[0])
          : "",
        node.repeat
          ? buildRailroadItem(node.repeat)
          : undefined
      );
    default:
      return Terminal(node.text ?? node.type);
  }
}

const SYNTAX_CONFIGS: Record<DiagramSyntax, SyntaxConfig> = {
  graphviz: {
    defaultCode: `digraph G {
  rankdir=TB

  Start [shape=ellipse]
  Process [shape=box]
  Decision [shape=diamond]
  End [shape=ellipse]

  Start -> Process
  Process -> Decision
  Decision -> Yes [label="yes"]
  Decision -> No [label="no"]
  Yes -> End
  No -> Process
}`,
    syntaxHelp: [
      { label: "Basic", description: "digraph G { A -> B }" },
      {
        label: "Shapes",
        description: "node [shape=box/ellipse/diamond]",
      },
      {
        label: "Styles",
        description: "[style=filled, fillcolor=lightblue]",
      },
      {
        label: "Labels",
        description: "A [label=text] | A -> B [label=text]",
      },
      {
        label: "Direction",
        description:
          "rankdir=TB (top-bottom) | LR (left-right)",
      },
    ],
    docsUrl: "https://graphviz.org/documentation/",
  },
  nomnoml: {
    defaultCode: `[User] -> [Application]
[Application] -> [Database]

[User|
  +name: string
  +email: string
  |
  +login()
  +logout()
]

[Application|
  -config: Config
  |
  +start()
  +stop()
]

[Database|
  +connect()
  +query()
]`,
    syntaxHelp: [
      {
        label: "Class",
        description: "[ClassName| +field: type | +method()]",
      },
      {
        label: "Association",
        description: "[A] -> [B] or [A] - [B]",
      },
      {
        label: "Inheritance",
        description: "[Child] -:> [Parent]",
      },
      {
        label: "Composition",
        description: "[Whole] +-> [Part]",
      },
      {
        label: "Note",
        description: "[<note> This is a note]",
      },
    ],
    docsUrl: "https://nomnoml.com/",
  },
  wavedrom: {
    defaultCode: `{ "signal": [
  { "name": "clk", "wave": "p......." },
  { "name": "data", "wave": "x.345x..", "data": ["A", "B", "C"] },
  { "name": "req", "wave": "0.1..0.." },
  { "name": "ack", "wave": "1....0.." }
]}`,
    syntaxHelp: [
      {
        label: "Clock",
        description: '"wave": "p" or "n" (pos/neg edge)',
      },
      {
        label: "Signal",
        description:
          '"wave": "0", "1", "x", "=" (low/high/unknown/data)',
      },
      {
        label: "Data",
        description: '"data": ["val1", "val2"]',
      },
      {
        label: "Gap",
        description: '"wave": "." (continue previous)',
      },
      {
        label: "Groups",
        description: '["Group", { name, wave }, ...]',
      },
    ],
    docsUrl: "https://wavedrom.com/tutorial.html",
  },
  mermaid: {
    defaultCode: `graph TD
  A[Start] --> B{Decision}
  B -->|Yes| C[Process A]
  B -->|No| D[Process B]
  C --> E[End]
  D --> E`,
    syntaxHelp: [
      {
        label: "Flowchart",
        description: "graph TD; A-->B; B-->C",
      },
      {
        label: "Sequence",
        description:
          "sequenceDiagram (newline) Alice->>Bob: Hello",
      },
      {
        label: "Class",
        description:
          "classDiagram (newline) class Animal { +name }",
      },
      {
        label: "ER",
        description:
          "erDiagram (newline) A ||--o{ B : places",
      },
      {
        label: "Gantt",
        description:
          "gantt (newline) title Plan (newline) section A",
      },
    ],
    docsUrl: "https://mermaid.js.org/intro/syntax-reference.html",
  },
  railroad: {
    defaultCode: `{
  "type": "Diagram",
  "items": [
    { "type": "Terminal", "text": "SELECT" },
    {
      "type": "Choice",
      "default": 0,
      "items": [
        { "type": "Terminal", "text": "*" },
        {
          "type": "OneOrMore",
          "items": [
            { "type": "NonTerminal", "text": "column" }
          ],
          "repeat": { "type": "Terminal", "text": "," }
        }
      ]
    },
    { "type": "Terminal", "text": "FROM" },
    { "type": "NonTerminal", "text": "table" },
    {
      "type": "Optional",
      "items": [
        {
          "type": "Sequence",
          "items": [
            { "type": "Terminal", "text": "WHERE" },
            { "type": "NonTerminal", "text": "condition" }
          ]
        }
      ]
    }
  ]
}`,
    syntaxHelp: [
      {
        label: "Terminal",
        description:
          '{ "type": "Terminal", "text": "keyword" }',
      },
      {
        label: "NonTerminal",
        description:
          '{ "type": "NonTerminal", "text": "rule" }',
      },
      {
        label: "Choice",
        description:
          '{ "type": "Choice", "default": 0, "items": [...] }',
      },
      {
        label: "Optional",
        description: '{ "type": "Optional", "items": [...] }',
      },
      {
        label: "Repeat",
        description:
          '{ "type": "OneOrMore"/"ZeroOrMore", "items": [...], "repeat": {...} }',
      },
    ],
    docsUrl: "https://github.com/tabatkins/railroad-diagrams/blob/gh-pages/README.md",
  },
};

// Counter for unique mermaid render IDs
let mermaidRenderCounter = 0;

export const App = () => {
  const intl = useIntl();
  const isSupported = useFeatureSupport();

  // Translated syntax options for the dropdown
  const syntaxOptions = useMemo(
    () => [
      {
        value: "graphviz",
        label: intl.formatMessage({
          defaultMessage: "DOT (Flowcharts)",
          description:
            "Dropdown option for DOT/Graphviz flowchart syntax",
        }),
      },
      {
        value: "mermaid",
        label: intl.formatMessage({
          defaultMessage: "Mermaid (Multi-purpose)",
          description:
            "Dropdown option for Mermaid multi-purpose diagram syntax",
        }),
      },
      {
        value: "nomnoml",
        label: intl.formatMessage({
          defaultMessage: "Nomnoml (UML)",
          description:
            "Dropdown option for Nomnoml UML diagram syntax",
        }),
      },
      {
        value: "railroad",
        label: intl.formatMessage({
          defaultMessage: "Railroad (Syntax)",
          description:
            "Dropdown option for Railroad syntax diagram",
        }),
      },
      {
        value: "wavedrom",
        label: intl.formatMessage({
          defaultMessage: "WaveDrom (Timing)",
          description:
            "Dropdown option for WaveDrom timing diagram syntax",
        }),
      },
    ],
    [intl]
  );
  const addElement = [addElementAtPoint, addElementAtCursor].find(
    (fn) => isSupported(fn)
  );

  const [syntax, setSyntax] =
    useState<DiagramSyntax>("graphviz");
  const [codeInput, setCodeInput] = useState(
    SYNTAX_CONFIGS.graphviz.defaultCode
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasValidDiagram, setHasValidDiagram] = useState(false);
  const [vizInstance, setVizInstance] = useState<Viz | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);

  // Advanced options — Railroad colors
  const [railroadBoxFill, setRailroadBoxFill] =
    useState("#ccffcc");
  const [railroadBoxBorder, setRailroadBoxBorder] =
    useState("#000000");
  const [railroadBg, setRailroadBg] =
    useState("#ffffff");
  const [railroadTextColor, setRailroadTextColor] =
    useState("#000000");

  // Advanced options toggle
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Advanced options — Mermaid theme
  const [mermaidTheme, setMermaidTheme] =
    useState<MermaidTheme>("default");

  // Initialize Viz.js instance once
  useEffect(() => {
    instance().then(setVizInstance);
  }, []);

  // Handle syntax change - update code to default for new syntax
  const handleSyntaxChange = (newSyntax: string) => {
    const typedSyntax = newSyntax as DiagramSyntax;
    setSyntax(typedSyntax);
    setCodeInput(SYNTAX_CONFIGS[typedSyntax].defaultCode);
    setError(null);
    // Reset advanced options
    setShowAdvanced(false);
    setRailroadBoxFill("#ccffcc");
    setRailroadBoxBorder("#000000");
    setRailroadBg("#ffffff");
    setRailroadTextColor("#000000");
    setMermaidTheme("default");
  };

  // Render diagram based on current syntax
  const renderDiagram = useCallback(
    (container: HTMLDivElement, code: string): boolean => {
      container.innerHTML = "";

      if (!code.trim()) {
        return false;
      }

      try {
        switch (syntax) {
          case "graphviz": {
            if (!vizInstance) return false;
            const svg = vizInstance.renderSVGElement(code);
            container.appendChild(svg);
            return true;
          }
          case "nomnoml": {
            const cleaned = code
              .split("\n")
              .map((line) => line.trimEnd())
              .join("\n")
              .trim();
            const svg = nomnoml.renderSvg(cleaned);
            container.innerHTML = svg;
            return true;
          }
          case "wavedrom": {
            const trimmed = code.trim();
            const parsed = JSON.parse(trimmed);
            const onml = wavedrom.renderAny(
              0,
              parsed,
              wavedrom.waveSkin
            );
            const html = wavedrom.onml.stringify(onml);
            container.innerHTML = html;
            return true;
          }
          case "railroad": {
            const spec = JSON.parse(code.trim()) as RailroadNode;
            const items = (spec.items ?? []).map(
              buildRailroadItem
            );
            const diagram = RailroadDiagram(...items);
            const svgEl = diagram.toSVG();
            // Inject railroad CSS directly into SVG so styles
            // work both in preview and when exported
            const styleEl = document.createElementNS(
              "http://www.w3.org/2000/svg",
              "style"
            );
            styleEl.textContent = `
              svg.railroad-diagram {
                background-color: ${railroadBg};
              }
              svg.railroad-diagram path {
                stroke-width: 3;
                stroke: ${railroadBoxBorder};
                fill: rgba(0,0,0,0);
              }
              svg.railroad-diagram text {
                font: bold 14px monospace;
                text-anchor: middle;
                fill: ${railroadTextColor};
              }
              svg.railroad-diagram text.label {
                text-anchor: start;
              }
              svg.railroad-diagram text.comment {
                font: italic 12px monospace;
              }
              svg.railroad-diagram rect {
                stroke-width: 3;
                stroke: ${railroadBoxBorder};
                fill: ${railroadBoxFill};
              }
            `;
            svgEl.insertBefore(styleEl, svgEl.firstChild);
            container.appendChild(svgEl);
            return true;
          }
          default:
            return false;
        }
      } catch {
        return false;
      }
    },
    [syntax, vizInstance, railroadBoxFill, railroadBoxBorder, railroadBg, railroadTextColor]
  );

  // Async render for mermaid and vega-lite
  const renderDiagramAsync = useCallback(
    async (
      container: HTMLDivElement,
      code: string
    ): Promise<boolean> => {
      container.innerHTML = "";

      if (!code.trim()) {
        return false;
      }

      try {
        switch (syntax) {
          case "mermaid": {
            ensureMermaidInit(mermaidTheme);
            const id = `mermaid-${++mermaidRenderCounter}`;
            const { svg } = await mermaid.render(id, code);
            container.innerHTML = svg;
            return true;
          }
          default:
            return false;
        }
      } catch {
        return false;
      }
    },
    [syntax, mermaidTheme]
  );

  const isAsyncSyntax =
    syntax === "mermaid";

  // Render preview whenever input or syntax changes
  useEffect(() => {
    if (!previewRef.current) return;

    const invalidSyntaxMsg = intl.formatMessage({
      defaultMessage: "Invalid syntax",
      description:
        "Error message when diagram syntax is invalid",
    });

    if (isAsyncSyntax) {
      let cancelled = false;
      renderDiagramAsync(previewRef.current, codeInput)
        .then((success) => {
          if (cancelled) return;
          setHasValidDiagram(success);
          if (success) {
            setError(null);
          } else if (codeInput.trim()) {
            setError(invalidSyntaxMsg);
          }
        })
        .catch(() => {
          if (cancelled) return;
          setHasValidDiagram(false);
          setError(invalidSyntaxMsg);
        });
      return () => {
        cancelled = true;
      };
    }

    try {
      const success = renderDiagram(
        previewRef.current,
        codeInput
      );
      setHasValidDiagram(success);
      if (success) {
        setError(null);
      } else if (codeInput.trim()) {
        setError(invalidSyntaxMsg);
      }
    } catch {
      setHasValidDiagram(false);
      setError(invalidSyntaxMsg);
    }
    return undefined;
  }, [
    codeInput,
    syntax,
    renderDiagram,
    renderDiagramAsync,
    isAsyncSyntax,
    intl,
  ]);

  const handleAddToDesign = async () => {
    if (!addElement || !exportRef.current) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Render fresh diagram for export
      let success: boolean;
      if (isAsyncSyntax) {
        success = await renderDiagramAsync(
          exportRef.current,
          codeInput
        );
      } else {
        success = renderDiagram(exportRef.current, codeInput);
      }
      if (!success) {
        throw new Error("Failed to render diagram");
      }

      const svgElement =
        exportRef.current.querySelector("svg");
      if (!svgElement) {
        throw new Error("No SVG found");
      }

      // Clone the SVG
      const svgClone = svgElement.cloneNode(
        true
      ) as SVGElement;

      // Get dimensions from viewBox (most reliable for Mermaid),
      // then numeric attributes, then style max-width, then defaults.
      // Mermaid v11 sets style="max-width: Xpx" instead of width attr.
      const viewBox = svgElement.getAttribute("viewBox");
      const vbParts = viewBox
        ? viewBox.split(/[\s,]+/).map(parseFloat)
        : [];
      const vbW = vbParts[2] || 0;
      const vbH = vbParts[3] || 0;

      const attrW = parseFloat(
        svgElement.getAttribute("width") || "0"
      );
      const attrH = parseFloat(
        svgElement.getAttribute("height") || "0"
      );
      // Only trust attribute values if they look like absolute pixels
      // (not "100%" which parseFloat reads as 100)
      const attrWValid =
        attrW > 0 &&
        !/[%]/.test(svgElement.getAttribute("width") || "");
      const attrHValid =
        attrH > 0 &&
        !/[%]/.test(svgElement.getAttribute("height") || "");

      // Parse style max-width/max-height (Mermaid sets these)
      const styleMaxW = parseFloat(
        svgElement.style.maxWidth || "0"
      );
      const styleMaxH = parseFloat(
        svgElement.style.maxHeight || "0"
      );

      const width = vbW > 0 ? vbW
        : attrWValid ? attrW
        : styleMaxW > 0 ? styleMaxW
        : 400;
      const height = vbH > 0 ? vbH
        : attrHValid ? attrH
        : styleMaxH > 0 ? styleMaxH
        : 300;

      // Add padding
      const padding = 20;
      const totalWidth = width + padding * 2;
      const totalHeight = height + padding * 2;

      // Update viewBox
      if (viewBox) {
        const vbX = vbParts[0] ?? 0;
        const vbY = vbParts[1] ?? 0;
        const vbWidthVal = vbParts[2] ?? width;
        const vbHeightVal = vbParts[3] ?? height;
        svgClone.setAttribute(
          "viewBox",
          `${vbX - padding} ${vbY - padding} ${vbWidthVal + padding * 2} ${vbHeightVal + padding * 2}`
        );
      }

      svgClone.setAttribute("width", String(totalWidth));
      svgClone.setAttribute("height", String(totalHeight));

      // Add white background
      const bgRect = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "rect"
      );
      bgRect.setAttribute("x", "-9999");
      bgRect.setAttribute("y", "-9999");
      bgRect.setAttribute("width", "99999");
      bgRect.setAttribute("height", "99999");
      bgRect.setAttribute("fill", "#ffffff");
      svgClone.insertBefore(bgRect, svgClone.firstChild);

      let dataUrl: string;
      let mimeType: "image/svg+xml" | "image/png" =
        "image/svg+xml";

      if (syntax === "mermaid") {
        // Mermaid SVGs contain foreignObject, style tags, and
        // complex CSS that Canva's SVG parser rejects.
        // Pass the LIVE DOM svg (not clone) so computed styles
        // can be read. svgToPngDataUrl handles its own cloning.
        dataUrl = await svgToPngDataUrl(
          svgElement as SVGElement,
          totalWidth,
          totalHeight
        );
        mimeType = "image/png";
      } else {
        // Serialize SVG
        const serializer = new XMLSerializer();
        const svgString =
          serializer.serializeToString(svgClone);

        // Convert to base64
        const base64 = btoa(
          unescape(encodeURIComponent(svgString))
        );
        dataUrl = `data:image/svg+xml;base64,${base64}`;
      }

      // Upload to Canva
      const result = await upload({
        type: "image",
        mimeType,
        url: dataUrl,
        thumbnailUrl: dataUrl,
        aiDisclosure: "none",
      });

      // Add to design
      await addElement({
        type: "image",
        ref: result.ref,
        altText: {
          text: intl.formatMessage({
            defaultMessage: "Diagram",
            description: "Alt text for diagram image",
          }),
          decorative: false,
        },
      });
    } catch {
      setError(
        intl.formatMessage({
          defaultMessage: "Failed to add diagram to design",
          description:
            "Error message when adding diagram fails",
        })
      );
    } finally {
      setIsLoading(false);
    }
  };

  const currentConfig = SYNTAX_CONFIGS[syntax];

  return (
    <Scrollable>
      {/* Off-screen container for export rendering */}
      <div
        ref={exportRef}
        style={{
          position: "absolute",
          left: "-9999px",
          top: 0,
          width: "4000px",
          overflow: "visible",
        }}
      />
      <Box padding="2u">
        <Rows spacing="2u">
          {/* Syntax Selector */}
          <Rows spacing="1u">
            <Title size="small">
              <FormattedMessage
                defaultMessage="Diagram type"
                description="Label for the diagram type selector dropdown"
              />
            </Title>
            <Select
              options={syntaxOptions}
              value={syntax}
              onChange={handleSyntaxChange}
              stretch
            />
          </Rows>

          {/* Collapsible Syntax Reference */}
          <Accordion>
            <AccordionItem
              title={intl.formatMessage({
                defaultMessage: "Syntax reference",
                description:
                  "Title for the syntax reference section",
              })}
            >
              <Box padding="1u">
                <Rows spacing="1u">
                  {currentConfig.syntaxHelp.map(
                    (item, index) => (
                      <Text key={index} size="small">
                        <FormattedMessage
                          defaultMessage="<b>{label}:</b> {description}"
                          description="Syntax help item"
                          values={{
                            b: (chunks) => (
                              <strong>{chunks}</strong>
                            ),
                            label: item.label,
                            description: item.description,
                          }}
                        />
                      </Text>
                    )
                  )}
                  <Link
                    href={currentConfig.docsUrl}
                    requestOpenExternalUrl={() =>
                      requestOpenExternalUrl({
                        url: currentConfig.docsUrl,
                      })
                    }
                  >
                    <FormattedMessage
                      defaultMessage="Full documentation"
                      description="Link text for external syntax documentation"
                    />
                  </Link>
                </Rows>
              </Box>
            </AccordionItem>
          </Accordion>

          {/* Code Input */}
          <Rows spacing="1u">
            <Title size="small">
              {intl.formatMessage({
                defaultMessage: "Code",
                description: "Label for the code input field",
              })}
            </Title>
            <MultilineInput
              minRows={6}
              maxRows={10}
              value={codeInput}
              onChange={(value) => setCodeInput(value)}
              placeholder={intl.formatMessage({
                defaultMessage: "Enter diagram code here...",
                description: "Placeholder for code input",
              })}
            />
          </Rows>

          {/* Advanced Options — only for Railroad and Mermaid */}
          {(syntax === "railroad" || syntax === "mermaid") && (
            <Rows spacing="1.5u">
              <Switch
                label={intl.formatMessage({
                  defaultMessage: "Advanced options",
                  description:
                    "Toggle for showing advanced options",
                })}
                value={showAdvanced}
                onChange={setShowAdvanced}
              />
              {showAdvanced && (
                <Rows spacing="1.5u">
                  {syntax === "railroad" && (
                    <>
                      <FormField
                        label={intl.formatMessage({
                          defaultMessage: "Box fill",
                          description:
                            "Label for railroad box fill color picker",
                        })}
                        control={() => (
                          <ColorSelector
                            color={railroadBoxFill}
                            onChange={setRailroadBoxFill}
                          />
                        )}
                      />
                      <FormField
                        label={intl.formatMessage({
                          defaultMessage: "Border & lines",
                          description:
                            "Label for railroad border color picker",
                        })}
                        control={() => (
                          <ColorSelector
                            color={railroadBoxBorder}
                            onChange={setRailroadBoxBorder}
                          />
                        )}
                      />
                      <FormField
                        label={intl.formatMessage({
                          defaultMessage: "Background",
                          description:
                            "Label for railroad background color picker",
                        })}
                        control={() => (
                          <ColorSelector
                            color={railroadBg}
                            onChange={setRailroadBg}
                          />
                        )}
                      />
                      <FormField
                        label={intl.formatMessage({
                          defaultMessage: "Text color",
                          description:
                            "Label for railroad text color picker",
                        })}
                        control={() => (
                          <ColorSelector
                            color={railroadTextColor}
                            onChange={setRailroadTextColor}
                          />
                        )}
                      />
                    </>
                  )}
                  {syntax === "mermaid" && (
                    <FormField
                      label={intl.formatMessage({
                        defaultMessage: "Theme",
                        description:
                          "Label for mermaid theme selector",
                      })}
                      control={(props) => (
                        <Select
                          {...props}
                          options={[
                            {
                              value: "default",
                              label: intl.formatMessage({
                                defaultMessage: "Default",
                                description:
                                  "Mermaid theme option: default",
                              }),
                            },
                            {
                              value: "dark",
                              label: intl.formatMessage({
                                defaultMessage: "Dark",
                                description:
                                  "Mermaid theme option: dark",
                              }),
                            },
                            {
                              value: "neutral",
                              label: intl.formatMessage({
                                defaultMessage: "Neutral",
                                description:
                                  "Mermaid theme option: neutral",
                              }),
                            },
                            {
                              value: "forest",
                              label: intl.formatMessage({
                                defaultMessage: "Forest",
                                description:
                                  "Mermaid theme option: forest",
                              }),
                            },
                          ]}
                          value={mermaidTheme}
                          onChange={(v) => setMermaidTheme(v as MermaidTheme)}
                          stretch
                        />
                      )}
                    />
                  )}
                </Rows>
              )}
            </Rows>
          )}

          {/* Preview */}
          <Rows spacing="1u">
            <Title size="small">
              {intl.formatMessage({
                defaultMessage: "Preview",
                description:
                  "Label for the diagram preview section",
              })}
            </Title>
            <Box
              background="neutral"
              borderRadius="standard"
              padding="2u"
            >
              <div
                ref={previewRef}
                className={styles.graphPreview}
              />
            </Box>
          </Rows>

          {/* Error message */}
          {error && <Alert tone="critical">{error}</Alert>}

          {/* Add to Design button */}
          <Button
            variant="primary"
            onClick={handleAddToDesign}
            disabled={
              !addElement || isLoading || !hasValidDiagram
            }
            loading={isLoading}
            stretch
            tooltipLabel={
              !addElement
                ? intl.formatMessage({
                    defaultMessage:
                      "This feature is not supported in the current page",
                    description:
                      "Tooltip label for when a feature is not supported",
                  })
                : !hasValidDiagram
                  ? intl.formatMessage({
                      defaultMessage:
                        "Enter valid code to enable",
                      description:
                        "Tooltip label for when there is no valid diagram",
                    })
                  : undefined
            }
          >
            {intl.formatMessage({
              defaultMessage: "Add to design",
              description:
                "Button text to add diagram to design",
            })}
          </Button>
        </Rows>
      </Box>
    </Scrollable>
  );
};
