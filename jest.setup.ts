// For usage information, see the README.md file.

// Mock diagram libraries before any imports
jest.mock("@viz-js/viz", () => ({
  instance: jest.fn(() =>
    Promise.resolve({
      renderSVGElement: jest.fn(() =>
        document.createElementNS("http://www.w3.org/2000/svg", "svg")
      ),
    })
  ),
}));

jest.mock("nomnoml", () => ({
  renderSvg: jest.fn(() => "<svg></svg>"),
}));

jest.mock("wavedrom", () => ({
  renderAny: jest.fn(() => ["svg", {}]),
  waveSkin: {},
  onml: {
    stringify: jest.fn(() => "<svg></svg>"),
  },
}));

jest.mock("mermaid", () => ({
  default: {
    initialize: jest.fn(),
    render: jest.fn(() =>
      Promise.resolve({ svg: "<svg></svg>" })
    ),
  },
  __esModule: true,
}));

jest.mock("vega-lite", () => ({
  compile: jest.fn(() => ({
    spec: {},
  })),
}));

jest.mock("vega", () => ({
  parse: jest.fn(() => ({})),
  View: jest.fn(() => ({
    toSVG: jest.fn(() => Promise.resolve("<svg></svg>")),
    finalize: jest.fn(),
  })),
}));

jest.mock("railroad-diagrams", () => {
  const mockItem = {
    addTo: jest.fn(),
    toSVG: jest.fn(() =>
      document.createElementNS("http://www.w3.org/2000/svg", "svg")
    ),
    format: jest.fn(),
  };
  return {
    Diagram: jest.fn(() => mockItem),
    ComplexDiagram: jest.fn(() => mockItem),
    Sequence: jest.fn(() => mockItem),
    Choice: jest.fn(() => mockItem),
    Optional: jest.fn(() => mockItem),
    OneOrMore: jest.fn(() => mockItem),
    ZeroOrMore: jest.fn(() => mockItem),
    Terminal: jest.fn(() => mockItem),
    NonTerminal: jest.fn(() => mockItem),
    Comment: jest.fn(() => mockItem),
    Skip: jest.fn(() => mockItem),
  };
});


// Import Canva SDK testing utilities
import * as asset from "@canva/asset/test";
import * as design from "@canva/design/test";
import * as error from "@canva/error/test";
import * as platform from "@canva/platform/test";
import * as user from "@canva/user/test";

/*
  Initialize test environments for each Canva SDK package
  This sets up the necessary test infrastructure before mocking the actual SDK methods
*/
asset.initTestEnvironment();
design.initTestEnvironment();
error.initTestEnvironment();
platform.initTestEnvironment();
user.initTestEnvironment();

/*
  Mock all Canva SDK packages except @canva/error
  This allows tests to run without making real API calls to Canva's services
*/
jest.mock("@canva/asset");
jest.mock("@canva/design");
jest.mock("@canva/platform");
jest.mock("@canva/user");

/*
  Important: @canva/error should not be mocked
  Use it to simulate API error responses from other mocks by throwing CanvaError instances
  This allows testing of error handling scenarios
*/
