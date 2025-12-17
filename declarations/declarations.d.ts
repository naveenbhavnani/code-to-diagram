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
