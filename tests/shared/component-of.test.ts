import { expect, test } from "bun:test";
import { componentOf } from "../../src/web/stores/inspect";

test("an element is a component's when its line is drawn more than once or lives in components/", () => {
  expect(componentOf({ loc: "src/components/ui/price-tag.tsx:12:4", uses: 1 })).toEqual({ name: "PriceTag", uses: 1 });
  expect(componentOf({ loc: "src/pages/Home.tsx:40", uses: 3 })).toEqual({ name: "Home", uses: 3 });
  expect(componentOf({ loc: "src/pages/Home.tsx:40", uses: 1 })).toBeNull();
  expect(componentOf({})).toBeNull();
});
