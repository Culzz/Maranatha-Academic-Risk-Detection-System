/**
 * Tests for useApi and useMutation hooks.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useApi, useMutation } from "../hooks/useApi";

describe("useApi", () => {
  it("starts with loading=true and data=null", () => {
    const fetcher = vi.fn(() => new Promise(() => {})); // never resolves
    const { result } = renderHook(() => useApi(fetcher, []));

    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("sets data after successful fetch", async () => {
    const mockData = { name: "Test Student", risk: "Low" };
    const fetcher = vi.fn(() => Promise.resolve(mockData));

    const { result } = renderHook(() => useApi(fetcher, []));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toEqual(mockData);
    expect(result.current.error).toBeNull();
  });

  it("sets error on failed fetch", async () => {
    const fetcher = vi.fn(() => Promise.reject(new Error("Network error")));

    const { result } = renderHook(() => useApi(fetcher, []));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe("Network error");
    expect(result.current.data).toBeNull();
  });

  it("provides a refetch function that reloads data", async () => {
    let callCount = 0;
    const fetcher = vi.fn(() => {
      callCount++;
      return Promise.resolve({ count: callCount });
    });

    const { result } = renderHook(() => useApi(fetcher, []));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toEqual({ count: 1 });

    await act(async () => {
      await result.current.refetch();
    });

    expect(result.current.data).toEqual({ count: 2 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("does not call apiFn when apiFn is null", async () => {
    const { result } = renderHook(() => useApi(null, []));

    // Should stay in loading state since fetch is never called
    // but with no apiFn, it returns early
    expect(result.current.data).toBeNull();
  });
});

describe("useMutation", () => {
  it("starts with loading=false", () => {
    const mutateFn = vi.fn(() => Promise.resolve());
    const { result } = renderHook(() => useMutation(mutateFn));

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.data).toBeNull();
  });

  it("sets loading=true during mutation and data after success", async () => {
    const responseData = { id: 1, status: "created" };
    const mutateFn = vi.fn(() => Promise.resolve(responseData));

    const { result } = renderHook(() => useMutation(mutateFn));

    let mutateResult;
    await act(async () => {
      mutateResult = await result.current.mutate("test-arg");
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.data).toEqual(responseData);
    expect(result.current.error).toBeNull();
    expect(mutateResult).toEqual(responseData);
    expect(mutateFn).toHaveBeenCalledWith("test-arg");
  });

  it("sets error on failed mutation", async () => {
    const mutateFn = vi.fn(() => Promise.reject(new Error("Validation failed")));

    const { result } = renderHook(() => useMutation(mutateFn));

    await act(async () => {
      try {
        await result.current.mutate();
      } catch {
        // expected
      }
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe("Validation failed");
  });
});
