import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import Modal from "../../components/ui/Modal";

// AnimatePresence + motion.div from framer-motion need to be handled.
// The component uses `open` (not `isOpen`) and renders via AnimatePresence.

describe("Modal", () => {
  it("renders children when open", () => {
    render(
      <Modal open={true} onClose={() => {}} title="Test Modal">
        <p>Modal content</p>
      </Modal>
    );
    expect(screen.getByText("Modal content")).toBeTruthy();
  });

  it("does not render when closed", () => {
    render(
      <Modal open={false} onClose={() => {}} title="Test Modal">
        <p>Modal content</p>
      </Modal>
    );
    expect(screen.queryByText("Modal content")).toBeNull();
  });

  it("renders the title in a heading", () => {
    render(
      <Modal open={true} onClose={() => {}} title="My Dialog">
        <p>Body</p>
      </Modal>
    );
    const heading = screen.getByText("My Dialog");
    expect(heading).toBeTruthy();
    expect(heading.tagName).toBe("H2");
  });

  it("renders subtitle when provided", () => {
    render(
      <Modal open={true} onClose={() => {}} title="Title" subtitle="Sub info">
        <p>Content</p>
      </Modal>
    );
    expect(screen.getByText("Sub info")).toBeTruthy();
  });

  it("has correct ARIA attributes", () => {
    render(
      <Modal open={true} onClose={() => {}} title="Test Modal">
        <p>Content</p>
      </Modal>
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeTruthy();
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    // aria-labelledby should reference the heading
    const labelledBy = dialog.getAttribute("aria-labelledby");
    expect(labelledBy).toBeTruthy();
  });

  it("calls onClose when Escape is pressed", () => {
    const onClose = vi.fn();
    render(
      <Modal open={true} onClose={onClose} title="Test">
        <p>Content</p>
      </Modal>
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when close button is clicked", () => {
    const onClose = vi.fn();
    render(
      <Modal open={true} onClose={onClose} title="Test">
        <p>Content</p>
      </Modal>
    );
    const closeBtn = screen.getByLabelText("Close dialog");
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when backdrop is clicked", () => {
    const onClose = vi.fn();
    render(
      <Modal open={true} onClose={onClose} title="Test">
        <p>Content</p>
      </Modal>
    );
    // The backdrop has aria-hidden="true"
    const backdrop = document.querySelector('[aria-hidden="true"]');
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it("renders footer when provided", () => {
    render(
      <Modal
        open={true}
        onClose={() => {}}
        title="Test"
        footer={<button>Save</button>}
      >
        <p>Body</p>
      </Modal>
    );
    expect(screen.getByText("Save")).toBeTruthy();
  });

  it("does not render footer when not provided", () => {
    render(
      <Modal open={true} onClose={() => {}} title="Test">
        <p>Body</p>
      </Modal>
    );
    expect(screen.queryByText("Save")).toBeNull();
  });
});
