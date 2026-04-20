import { useCallback, useEffect, useRef, useState } from "react";
export function useFloatingMenu(minWidth = 150) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState(null);
  const menuBtnRef = useRef(null);
  const menuRef = useRef(null);
  const computeMenuPosition = useCallback(event => {
    const gutter = 8;
    const btn = menuBtnRef.current;
    const fallbackRect = btn?.getBoundingClientRect?.();
    const rawLeft = typeof event?.clientX === "number" ? event.clientX + 6 : (fallbackRect?.right || gutter) + 6;
    const rawTop = typeof event?.clientY === "number" ? event.clientY + 6 : (fallbackRect?.bottom || gutter) + 6;
    const viewportWidth = window.innerWidth || 0;
    const viewportHeight = window.innerHeight || 0;
    const left = Math.max(gutter, Math.min(rawLeft, Math.max(gutter, viewportWidth - minWidth - gutter)));
    const top = Math.max(gutter, Math.min(rawTop, Math.max(gutter, viewportHeight - 120 - gutter)));
    return {
      left,
      top
    };
  }, [minWidth]);
  useEffect(() => {
    if (!menuOpen) {
      setMenuStyle(null);
      return;
    }
    const handlePointerDown = event => {
      const target = event.target;
      if (menuRef.current?.contains(target) || menuBtnRef.current?.contains(target)) {
        return;
      }
      setMenuOpen(false);
    };
    const handleEscape = event => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [menuOpen]);
  const toggleMenu = useCallback(event => {
    if (event?.stopPropagation) event.stopPropagation();
    setMenuOpen(open => {
      const nextOpen = !open;
      setMenuStyle(nextOpen ? computeMenuPosition(event) : null);
      return nextOpen;
    });
  }, [computeMenuPosition]);
  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    setMenuStyle(null);
  }, []);
  const wrapAction = useCallback(callback => {
    return async event => {
      if (event?.stopPropagation) event.stopPropagation();
      closeMenu();
      if (!callback) return;
      try {
        await callback(event);
      } catch (err) {
        console.warn("[floating-menu] action failed", err);
      }
    };
  }, [closeMenu]);
  return {
    menuOpen,
    menuStyle,
    menuBtnRef,
    menuRef,
    toggleMenu,
    closeMenu,
    wrapAction
  };
}
