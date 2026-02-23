declare module "*.css" {
  const styles: { [className: string]: string };
  export = styles;
}

declare module "*.jpg" {
  const content: string;
  export default content;
}

declare module "*.jpeg" {
  const content: string;
  export default content;
}

declare module "*.png" {
  const content: string;
  export default content;
}

declare module "*.svg" {
  const content: React.FunctionComponent<{
    size?: "tiny" | "small" | "medium" | "large";
    className?: string;
  }>;
  export default content;
}

declare const BACKEND_HOST: string;

// Type declaration for railroad-diagrams
declare module "railroad-diagrams" {
  interface DiagramItem {
    addTo(parent: HTMLElement | DiagramItem): void;
    toSVG(): SVGElement;
    format(
      x?: number,
      y?: number,
      width?: number
    ): DiagramItem;
  }
  export function Diagram(
    ...items: (DiagramItem | string)[]
  ): DiagramItem;
  export function ComplexDiagram(
    ...items: (DiagramItem | string)[]
  ): DiagramItem;
  export function Sequence(
    ...items: (DiagramItem | string)[]
  ): DiagramItem;
  export function Choice(
    defaultIndex: number,
    ...items: (DiagramItem | string)[]
  ): DiagramItem;
  export function Optional(
    item: DiagramItem | string,
    skip?: string
  ): DiagramItem;
  export function OneOrMore(
    item: DiagramItem | string,
    repeat?: DiagramItem | string
  ): DiagramItem;
  export function ZeroOrMore(
    item: DiagramItem | string,
    repeat?: DiagramItem | string
  ): DiagramItem;
  export function Terminal(
    text: string,
    href?: string
  ): DiagramItem;
  export function NonTerminal(
    text: string,
    href?: string
  ): DiagramItem;
  export function Comment(text: string): DiagramItem;
  export function Skip(): DiagramItem;
}

// Type declaration for wavedrom
declare module "wavedrom" {
  interface WaveDrom {
    renderAny: (index: number, source: object, skin: unknown) => unknown;
    waveSkin: unknown;
    onml: {
      stringify: (onml: unknown) => string;
    };
  }
  const wavedrom: WaveDrom;
  export default wavedrom;
}
