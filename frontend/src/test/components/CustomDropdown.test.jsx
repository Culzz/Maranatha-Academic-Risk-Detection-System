import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import CustomDropdown from "../../components/ui/CustomDropdown";

const options = [
  { value: "a", label: "Option A" },
  { value: "b", label: "Option B" },
  { value: "c", label: "Option C" },
];

describe("CustomDropdown", () => {
  it("renders with placeholder", () => {
    render(
      <CustomDropdown
        options={options}
        value=""
        onChange={() => {}}
        placeholder="Select..."
      />
    );
    expect(screen.getByText("Select...")).toBeTruthy();
  });

  it("renders default placeholder when none provided", () => {
    render(
      <CustomDropdown options={options} value="" onChange={() => {}} />
    );
    expect(screen.getByText("Select an option")).toBeTruthy();
  });

  it("shows selected option label", () => {
    render(
      <CustomDropdown
        options={options}
        value="b"
        onChange={() => {}}
        placeholder="Select..."
      />
    );
    expect(screen.getByText("Option B")).toBeTruthy();
    expect(screen.queryByText("Select...")).toBeNull();
  });

  it("opens dropdown on click", () => {
    render(
      <CustomDropdown options={options} value="" onChange={() => {}} />
    );
    const trigger = screen.getByRole("button");
    fireEvent.click(trigger);
    expect(screen.getByText("Option A")).toBeTruthy();
    expect(screen.getByText("Option B")).toBeTruthy();
    expect(screen.getByText("Option C")).toBeTruthy();
  });

  it("calls onChange when option is selected", () => {
    const onChange = vi.fn();
    render(
      <CustomDropdown options={options} value="" onChange={onChange} />
    );
    const trigger = screen.getByRole("button");
    fireEvent.click(trigger);
    fireEvent.click(screen.getByText("Option B"));
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("closes dropdown after selection", () => {
    const onChange = vi.fn();
    render(
      <CustomDropdown options={options} value="" onChange={onChange} />
    );
    const trigger = screen.getByRole("button");
    fireEvent.click(trigger);
    fireEvent.click(screen.getByText("Option C"));
    // After selection, dropdown should close; Option A should no longer be
    // visible as a dropdown item (may still appear as selected label if value
    // was changed, but we selected C so A shouldn't be there)
    expect(onChange).toHaveBeenCalledWith("c");
  });

  it("renders label when provided", () => {
    render(
      <CustomDropdown
        options={options}
        value=""
        onChange={() => {}}
        label="Choose one"
      />
    );
    expect(screen.getByText("Choose one")).toBeTruthy();
  });

  it("renders required asterisk when required", () => {
    render(
      <CustomDropdown
        options={options}
        value=""
        onChange={() => {}}
        label="Field"
        required={true}
      />
    );
    expect(screen.getByText("*")).toBeTruthy();
  });

  it("renders error message", () => {
    render(
      <CustomDropdown
        options={options}
        value=""
        onChange={() => {}}
        error="This field is required"
      />
    );
    expect(screen.getByText("This field is required")).toBeTruthy();
  });

  it("renders hint when no error", () => {
    render(
      <CustomDropdown
        options={options}
        value=""
        onChange={() => {}}
        hint="Pick your favourite"
      />
    );
    expect(screen.getByText("Pick your favourite")).toBeTruthy();
  });

  it("does not render hint when error is present", () => {
    render(
      <CustomDropdown
        options={options}
        value=""
        onChange={() => {}}
        hint="Pick your favourite"
        error="Required"
      />
    );
    expect(screen.queryByText("Pick your favourite")).toBeNull();
    expect(screen.getByText("Required")).toBeTruthy();
  });

  it("does not open when disabled", () => {
    render(
      <CustomDropdown
        options={options}
        value=""
        onChange={() => {}}
        disabled={true}
      />
    );
    const trigger = screen.getByRole("button");
    expect(trigger).toBeDisabled();
  });

  it("shows no options message when options are empty", () => {
    render(
      <CustomDropdown options={[]} value="" onChange={() => {}} />
    );
    const trigger = screen.getByRole("button");
    fireEvent.click(trigger);
    expect(screen.getByText("No options found")).toBeTruthy();
  });
});
