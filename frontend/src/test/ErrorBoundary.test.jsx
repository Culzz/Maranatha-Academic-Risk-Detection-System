import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ErrorBoundary from "../components/ErrorBoundary";

function ThrowError({ shouldThrow }) {
  if (shouldThrow) throw new Error("Test error");
  return <div>No error</div>;
}

describe("ErrorBoundary", () => {
  it("renders children when no error occurs", () => {
    render(
      <ErrorBoundary>
        <div>Safe content</div>
      </ErrorBoundary>
    );
    expect(screen.getByText("Safe content")).toBeInTheDocument();
  });

  it("renders error UI when a child throws", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow />
      </ErrorBoundary>
    );
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByText("Try Again")).toBeInTheDocument();
    expect(screen.getByText("Refresh Page")).toBeInTheDocument();
    consoleSpy.mockRestore();
  });

  it("recovers when Try Again is clicked", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { rerender } = render(
      <ErrorBoundary>
        <ThrowError shouldThrow />
      </ErrorBoundary>
    );
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();

    // Rerender with non-throwing child so recovery doesn't re-throw
    rerender(
      <ErrorBoundary>
        <ThrowError shouldThrow={false} />
      </ErrorBoundary>
    );

    fireEvent.click(screen.getByText("Try Again"));
    expect(screen.getByText("No error")).toBeInTheDocument();
    consoleSpy.mockRestore();
  });
});
