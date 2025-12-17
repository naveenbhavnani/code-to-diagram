import { useFeatureSupport } from "@canva/app-hooks";
import {
  Accordion,
  AccordionItem,
  Alert,
  Box,
  Button,
  MultilineInput,
  Rows,
  Scrollable,
  Select,
  Text,
  Title,
} from "@canva/app-ui-kit";
import { upload } from "@canva/asset";
import { addElementAtCursor, addElementAtPoint } from "@canva/design";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import { instance, type Viz } from "@viz-js/viz";
import nomnoml from "nomnoml";
import wavedrom from "wavedrom";
import * as styles from "styles/components.css";

// Diagram syntax types
type DiagramSyntax = "graphviz" | "nomnoml" | "wavedrom";

interface SyntaxConfig {
  defaultCode: string;
  syntaxHelp: { label: string; description: string }[];
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
      { label: "Shapes", description: "node [shape=box/ellipse/diamond]" },
      { label: "Styles", description: "[style=filled, fillcolor=lightblue]" },
      { label: "Labels", description: "A [label=text] | A -> B [label=text]" },
      { label: "Direction", description: "rankdir=TB (top-bottom) | LR (left-right)" },
    ],
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
      { label: "Class", description: "[ClassName| +field: type | +method()]" },
      { label: "Association", description: "[A] -> [B] or [A] - [B]" },
      { label: "Inheritance", description: "[Child] -:> [Parent]" },
      { label: "Composition", description: "[Whole] +--> [Part]" },
      { label: "Note", description: "[<note> This is a note]" },
    ],
  },
  wavedrom: {
    defaultCode: `{ "signal": [
  { "name": "clk", "wave": "p......." },
  { "name": "data", "wave": "x.345x..", "data": ["A", "B", "C"] },
  { "name": "req", "wave": "0.1..0.." },
  { "name": "ack", "wave": "1....0.." }
]}`,
    syntaxHelp: [
      { label: "Clock", description: '"wave": "p" or "n" (pos/neg edge)' },
      { label: "Signal", description: '"wave": "0", "1", "x", "=" (low/high/unknown/data)' },
      { label: "Data", description: '"data": ["val1", "val2"]' },
      { label: "Gap", description: '"wave": "." (continue previous)' },
      { label: "Groups", description: '["Group", { name, wave }, ...]' },
    ],
  },
};

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
          description: "Dropdown option for DOT/Graphviz flowchart syntax",
        }),
      },
      {
        value: "nomnoml",
        label: intl.formatMessage({
          defaultMessage: "Nomnoml (UML)",
          description: "Dropdown option for Nomnoml UML diagram syntax",
        }),
      },
      {
        value: "wavedrom",
        label: intl.formatMessage({
          defaultMessage: "WaveDrom (Timing)",
          description: "Dropdown option for WaveDrom timing diagram syntax",
        }),
      },
    ],
    [intl]
  );
  const addElement = [addElementAtPoint, addElementAtCursor].find((fn) =>
    isSupported(fn)
  );

  const [syntax, setSyntax] = useState<DiagramSyntax>("graphviz");
  const [codeInput, setCodeInput] = useState(SYNTAX_CONFIGS.graphviz.defaultCode);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasValidDiagram, setHasValidDiagram] = useState(false);
  const [vizInstance, setVizInstance] = useState<Viz | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);

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
            // Trim each line to remove trailing spaces that cause parsing issues
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
            const onml = wavedrom.renderAny(0, parsed, wavedrom.waveSkin);
            const html = wavedrom.onml.stringify(onml);
            container.innerHTML = html;
            return true;
          }
          default:
            return false;
        }
      } catch {
        return false;
      }
    },
    [syntax, vizInstance]
  );

  // Render preview whenever input or syntax changes
  useEffect(() => {
    if (!previewRef.current) return;

    try {
      const success = renderDiagram(previewRef.current, codeInput);
      setHasValidDiagram(success);
      if (success) {
        setError(null);
      } else if (codeInput.trim()) {
        setError(
          intl.formatMessage({
            defaultMessage: "Invalid syntax",
            description: "Error message when diagram syntax is invalid",
          })
        );
      }
    } catch {
      setHasValidDiagram(false);
      setError(
        intl.formatMessage({
          defaultMessage: "Invalid syntax",
          description: "Error message when diagram syntax is invalid",
        })
      );
    }
  }, [codeInput, syntax, renderDiagram, intl]);

  const handleAddToDesign = async () => {
    if (!addElement || !exportRef.current) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Render fresh diagram for export
      const success = renderDiagram(exportRef.current, codeInput);
      if (!success) {
        throw new Error("Failed to render diagram");
      }

      const svgElement = exportRef.current.querySelector("svg");
      if (!svgElement) {
        throw new Error("No SVG found");
      }

      // Clone the SVG
      const svgClone = svgElement.cloneNode(true) as SVGElement;

      // Get dimensions
      const width = parseFloat(svgElement.getAttribute("width") || "400");
      const height = parseFloat(svgElement.getAttribute("height") || "300");

      // Add padding
      const padding = 20;
      const totalWidth = width + padding * 2;
      const totalHeight = height + padding * 2;

      // Update viewBox
      const viewBox = svgElement.getAttribute("viewBox");
      if (viewBox) {
        const parts = viewBox.split(/[\s,]+/).map(parseFloat);
        const vbX = parts[0] ?? 0;
        const vbY = parts[1] ?? 0;
        const vbW = parts[2] ?? width;
        const vbH = parts[3] ?? height;
        svgClone.setAttribute(
          "viewBox",
          `${vbX - padding} ${vbY - padding} ${vbW + padding * 2} ${vbH + padding * 2}`
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

      // Serialize SVG
      const serializer = new XMLSerializer();
      const svgString = serializer.serializeToString(svgClone);

      // Convert to base64
      const base64 = btoa(unescape(encodeURIComponent(svgString)));
      const dataUrl = `data:image/svg+xml;base64,${base64}`;

      // Upload to Canva
      const result = await upload({
        type: "image",
        mimeType: "image/svg+xml",
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
          description: "Error message when adding diagram fails",
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
          width: "800px",
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
              description: "Title for the syntax reference section",
            })}
          >
            <Box padding="1u">
              <Rows spacing="1u">
                {currentConfig.syntaxHelp.map((item, index) => (
                  <Text key={index} size="small">
                    <FormattedMessage
                      defaultMessage="<b>{label}:</b> {description}"
                      description="Syntax help item"
                      values={{
                        b: (chunks) => <strong>{chunks}</strong>,
                        label: item.label,
                        description: item.description,
                      }}
                    />
                  </Text>
                ))}
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

        {/* Preview */}
        <Rows spacing="1u">
          <Title size="small">
            {intl.formatMessage({
              defaultMessage: "Preview",
              description: "Label for the diagram preview section",
            })}
          </Title>
          <Box background="neutral" borderRadius="standard" padding="2u">
            <div ref={previewRef} className={styles.graphPreview} />
          </Box>
        </Rows>

        {/* Error message */}
        {error && <Alert tone="critical">{error}</Alert>}

        {/* Add to Design button */}
        <Button
          variant="primary"
          onClick={handleAddToDesign}
          disabled={!addElement || isLoading || !hasValidDiagram}
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
                    defaultMessage: "Enter valid code to enable",
                    description:
                      "Tooltip label for when there is no valid diagram",
                  })
                : undefined
          }
        >
          {intl.formatMessage({
            defaultMessage: "Add to design",
            description: "Button text to add diagram to design",
          })}
        </Button>
        </Rows>
      </Box>
    </Scrollable>
  );
};
