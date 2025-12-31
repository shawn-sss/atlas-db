import { useCallback, useEffect, useRef, useState } from "react";

export function useFloatingMenu(minWidth = 150) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState(null);
  const menuBtnRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) {
      setMenuStyle(null);
      return;
    }

    const updatePosition = () => {
      const btn = menuBtnRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const left = Math.max(8, rect.right - minWidth);
      const top = rect.top + rect.height / 2;
      setMenuStyle({ left, top });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [menuOpen, minWidth]);

  const toggleMenu = useCallback((event) => {
    if (event?.stopPropagation) event.stopPropagation();
    setMenuOpen((open) => !open);
  }, []);

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  const wrapAction = useCallback(
    (callback) => {
      return async (event) => {
        if (event?.stopPropagation) event.stopPropagation();
        closeMenu();
        if (!callback) return;
        try {
          await callback(event);
        } catch (err) {}
      };
    },
    [closeMenu]
  );

  return {
    menuOpen,
    menuStyle,
    menuBtnRef,
    toggleMenu,
    closeMenu,
    wrapAction,
  };
}
