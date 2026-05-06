"use client";

import {useEffect, useRef} from "react";

const CHARS =
    "01アイウエオカキクケコサシスセソタチツテト" +
    "0123456789ABCDEF$+=-/×÷*<>{}[]";

export function MatrixRain() {
    const ref = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = ref.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const fontSize = 14;
        let w = 0;
        let h = 0;
        let drops: number[] = [];
        let raf = 0;
        let running = true;

        function resize() {
            if (!canvas || !ctx) return;
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            w = window.innerWidth;
            h = window.innerHeight;
            canvas.style.width = `${w}px`;
            canvas.style.height = `${h}px`;
            canvas.width = Math.floor(w * dpr);
            canvas.height = Math.floor(h * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.font = `${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
            ctx.textBaseline = "top";
            const cols = Math.ceil(w / fontSize);
            drops = Array.from({length: cols}, () => Math.random() * -h);
        }

        function tick() {
            if (!canvas || !ctx) return;
            // Faded backwash leaves a fading trail.
            ctx.fillStyle = "rgba(10, 10, 10, 0.08)";
            ctx.fillRect(0, 0, w, h);

            for (let i = 0; i < drops.length; i++) {
                const ch = CHARS[Math.floor(Math.random() * CHARS.length)];
                const y = drops[i];
                // Head: bright, slight glow. Trail: dim.
                ctx.fillStyle = "rgba(250, 204, 21, 0.85)";
                ctx.fillText(ch, i * fontSize, y);
                ctx.fillStyle = "rgba(250, 204, 21, 0.25)";
                ctx.fillText(ch, i * fontSize, y - fontSize);

                if (y > h && Math.random() > 0.975) {
                    drops[i] = -fontSize;
                } else {
                    drops[i] += fontSize * (0.45 + Math.random() * 0.25);
                }
            }
            if (running) raf = requestAnimationFrame(tick);
        }

        function onVisibility() {
            if (document.hidden) {
                running = false;
                cancelAnimationFrame(raf);
            } else if (!running) {
                running = true;
                raf = requestAnimationFrame(tick);
            }
        }

        resize();
        window.addEventListener("resize", resize);
        document.addEventListener("visibilitychange", onVisibility);
        raf = requestAnimationFrame(tick);

        return () => {
            running = false;
            cancelAnimationFrame(raf);
            window.removeEventListener("resize", resize);
            document.removeEventListener("visibilitychange", onVisibility);
        };
    }, []);

    return <canvas ref={ref} className="matrix-rain" aria-hidden />;
}
