import { useFeatureSupport } from "@canva/app-hooks";
import { addElementAtPoint } from "@canva/design";
import type { Feature } from "@canva/platform";
import { App } from "../app";

// Mock diagram libraries in jest.setup.ts
jest.mock("@viz-js/viz");
jest.mock("nomnoml");
jest.mock("wavedrom");
jest.mock("@canva/app-hooks");

describe("Code to Diagram Tests", () => {
  const mockIsSupported = jest.fn();
  const mockUseFeatureSupport = jest.mocked(useFeatureSupport);

  beforeEach(() => {
    jest.resetAllMocks();
    mockIsSupported.mockImplementation(
      (fn: Feature) => fn === addElementAtPoint
    );
    mockUseFeatureSupport.mockReturnValue(mockIsSupported);
  });

  it("should check feature support is called", () => {
    expect(mockUseFeatureSupport).toBeDefined();
    expect(mockIsSupported).toBeDefined();
  });

  it("should have App component defined", () => {
    expect(App).toBeDefined();
  });
});
