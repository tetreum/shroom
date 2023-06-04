import * as PIXI from "pixi.js";

export class TileCursor extends PIXI.Graphics {

  constructor() {
    super();
    
    const points = {
      p1: { x: 0, y: 16 },
      p2: { x: 32, y: 0 },
      p3: { x: 64, y: 16 },
      p4: { x: 32, y: 32 },
    };
    this.visible = false;
    this.drawBorder(points, 0x000000, 0.33, 0);
    this.drawBorder(points, 0xa7d1e0, 1, -2);
    this.drawBorder(points, 0xffffff, 1, -3);
  }

  private drawBorder(
    points: any,
    color: number,
    alpha = 1,
    offsetY: number
  ) : void {
    this.beginFill(color, alpha);
    this.moveTo(points.p1.x, points.p1.y + offsetY);
    this.lineTo(points.p2.x, points.p2.y + offsetY);
    this.lineTo(points.p3.x, points.p3.y + offsetY);
    this.lineTo(points.p4.x, points.p4.y + offsetY);
    this.endFill();

    this.beginHole();
    this.moveTo(points.p1.x + 6, points.p1.y + offsetY);
    this.lineTo(points.p2.x, points.p2.y + 3 + offsetY);
    this.lineTo(points.p3.x - 6, points.p3.y + offsetY);
    this.lineTo(points.p4.x, points.p4.y - 3 + offsetY);
    this.endHole();
  }
}
