// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MappingPropertyPicker } from "../src/catalog/MappingPropertyPicker.js";

afterEach(cleanup);
const options = [
  { key: "name", label: "IFC asset type name" },
  { key: "system", label: "Pset_Asset / Distribution system" },
  { key: "url", label: "Documents / FDVU Documentation" },
];

function Form({ onSubmit }: { onSubmit(): void }) {
  const [value, setValue] = useState("name");
  return <form onSubmit={event => { event.preventDefault(); onSubmit(); }}>
    <MappingPropertyPicker label="Map Asset name from IFC" value={value} options={options} onChange={setValue} />
    <button type="submit">Save</button>
  </form>;
}

it("searches all properties, selects the matching property with Enter and avoids submitting the form", () => {
  const submit = vi.fn();
  render(<Form onSubmit={submit} />);
  const input = screen.getByRole("combobox");
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "  DISTRIBUTION  " } });
  expect(screen.getByRole("option", { name: "Pset_Asset / Distribution system" })).toBeTruthy();
  expect(screen.queryByRole("option", { name: "IFC asset type name" })).toBeNull();
  fireEvent.keyDown(input, { key: "Enter" });
  expect(input).toHaveProperty("value", "Pset_Asset / Distribution system");
  expect(screen.queryByRole("listbox")).toBeNull();
  expect(submit).not.toHaveBeenCalled();
});

it("keeps the saved mapping when a search is cancelled or loses focus", () => {
  render(<Form onSubmit={vi.fn()} />);
  const input = screen.getByRole("combobox");
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "missing-property" } });
  expect(screen.getByRole("status").textContent).toContain("No matching properties");
  fireEvent.keyDown(input, { key: "Escape" });
  expect(input).toHaveProperty("value", "IFC asset type name");
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "unfinished search" } });
  fireEvent.blur(input, { relatedTarget: screen.getByRole("button", { name: "Save" }) });
  expect(input).toHaveProperty("value", "IFC asset type name");
});

it("allows choosing manual entry even when a search matches no properties", () => {
  render(<Form onSubmit={vi.fn()} />);
  const input = screen.getByRole("combobox");
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "nothing" } });
  fireEvent.click(screen.getByRole("option", { name: "Enter manually" }));
  expect(input).toHaveProperty("value", "Enter manually");
  expect(input.getAttribute("aria-expanded")).toBe("false");
});
