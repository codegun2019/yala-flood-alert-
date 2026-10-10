"use client";
import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { BarChart, LineChart } from "echarts/charts";
import { GridComponent, MarkAreaComponent, MarkLineComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

echarts.use([LineChart, BarChart, GridComponent, TooltipComponent, MarkLineComponent, MarkAreaComponent, CanvasRenderer]);

export default function Chart({ option, height = 220 }: { option: echarts.EChartsCoreOption; height?: number }) {
  const el = useRef<HTMLDivElement>(null);
  const inst = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!el.current) return;
    inst.current = echarts.init(el.current);
    const onResize = () => inst.current?.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      inst.current?.dispose();
      inst.current = null;
    };
  }, []);

  useEffect(() => {
    inst.current?.setOption(option, true);
  }, [option]);

  return <div ref={el} style={{ height, width: "100%" }} />;
}
