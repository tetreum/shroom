import * as PIXI from "pixi.js";
import { Subject } from "rxjs";
import {
  IRoomVisualization,
  MaskNode,
  PartNode,
} from "../../interfaces/IRoomVisualization";
import { RoomPosition } from "../../types/RoomPosition";
import { getZOrder } from "../../util/getZOrder";
import { ParsedTileType, ParsedTileWall } from "../../util/parseTileMap";
import { EventManager } from "../events/EventManager";
import { EventManagerContainer } from "../events/EventManagerContainer";
import { IEventManagerEvent } from "../events/interfaces/IEventManagerEvent";
import { ILandscapeContainer } from "./ILandscapeContainer";
import { IRoomRectangle, Rectangle } from "./IRoomRectangle";
import { ParsedTileMap } from "./ParsedTileMap";
import { IRoomPart } from "./parts/IRoomPart";
import { RoomPartData } from "./parts/RoomPartData";
import { Stair } from "./parts/Stair";
import { StairCorner } from "./parts/StairCorner";
import { Tile } from "./parts/Tile";
import { TileCursor } from "./parts/TileCursor";
import { WallLeft } from "./parts/WallLeft";
import { WallOuterCorner } from "./parts/WallOuterCorner";
import { WallRight } from "./parts/WallRight";
import { RoomLandscapeMaskSprite } from "./RoomLandscapeMaskSprite";
import { getTileMapBounds } from "./util/getTileMapBounds";

export class RoomModelVisualization
  extends PIXI.Container
  implements IRoomVisualization, IRoomRectangle, ILandscapeContainer {
  private _hideTileCursor = false;
  private _hideWalls = false;
  private _hideFloor = false;

  private _wallLeftColor: number | undefined;
  private _wallRightColor: number | undefined;
  private _wallTopColor: number | undefined;

  private _tileLeftColor: number | undefined;
  private _tileRightColor: number | undefined;
  private _tileTopColor: number | undefined;

  private _positionalContainer = new PIXI.Container();
  private _behindWallLayer: PIXI.Container = new PIXI.Container();
  private _wallLayer: PIXI.Container = new PIXI.Container();
  private _tileLayer: PIXI.Container = new PIXI.Container();
  private _primaryLayer: PIXI.Container = new PIXI.Container();
  private _landscapeLayer: PIXI.Container = new PIXI.Container();
  private _wallHitAreaLayer: PIXI.Container = new PIXI.Container();
  private _masksLayer: PIXI.Container = new PIXI.Container();

  private tileCursor: PIXI.Graphics = new PIXI.Graphics();
  private testMode: boolean = true;

  private _wallTexture: PIXI.Texture | undefined;
  private _floorTexture: PIXI.Texture | undefined;

  private _walls: (WallLeft | WallRight | WallOuterCorner)[] = [];
  private _tiles: (Tile | Stair | StairCorner)[] = [];
  private _tileCursors: TileCursor[] = [];
  private _masks: Map<string, RoomLandscapeMaskSprite> = new Map();

  private _parts: Set<IRoomPart> = new Set();

  private _borderWidth = 8;
  private _tileHeight = 8;
  private _wallHeight = 116;

  private _onActiveTileChange = new Subject<RoomPosition>();
  private _onActiveWallChange = new Subject<
    | {
        roomX: number;
        roomY: number;
        offsetX: number;
        offsetY: number;
        wall: "l" | "r";
      }
    | undefined
  >();

  private _onTileClick = new Subject<{
    position: RoomPosition,
    event: IEventManagerEvent
  }>();

  private _tileMapBounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };

  private _refreshRoom = false;
  private _rebuildRoom = false;

  constructor(
    private _eventManager: EventManager,
    private _application: PIXI.Application,
    public readonly parsedTileMap: ParsedTileMap
  ) {
    super();

    this._tileMapBounds = getTileMapBounds(this.parsedTileMap.parsedTileTypes, {
      x: this.parsedTileMap.wallOffsets.x,
      y: this.parsedTileMap.wallOffsets.y,
    });

    this._behindWallLayer.name = "BEHIND_WALL";
    this._wallLayer.name = "WALL";
    this._wallHitAreaLayer.name = "WALL_HIT";
    this._tileLayer.name = "TILES";
    this._landscapeLayer.name = "LANDSCAPE";
    this._primaryLayer.name = "PRIMARY";

    this.addChild(this._behindWallLayer);
    this.addChild(this._wallLayer);
    this.addChild(this._wallHitAreaLayer);
    this.addChild(this._tileLayer);
    this.addChild(this._landscapeLayer);
    this.addChild(this._primaryLayer);

    this.addChild(this._masksLayer);
    
    this._positionalContainer.x = -this.roomBounds.minX;
    this._positionalContainer.y = -this.roomBounds.minY;
    this._primaryLayer.sortableChildren = true;
    this._tileLayer.sortableChildren = true;

    this.addChild(this._positionalContainer);

    new EventManagerContainer(this._application, this._eventManager);

    this._updateHeightmap();

    if (this.testMode) {
      this.createCursor();  
    }

    this._application.ticker.add(this._handleTick);
  }

  addPart(part: IRoomPart): PartNode {
    this._parts.add(part);
    part.update(this._getCurrentRoomPartData());

    return {
      remove: () => {
        this._parts.delete(part);
      },
    };
  }

  getMaskLevel(roomX: number, roomY: number): { roomX: number; roomY: number } {
    return {
      roomX,
      roomY,
    };
  }

  public get onTileClick() {
    return this._onTileClick;
  }

  public get hideFloor() {
    return this._hideFloor;
  }

  public set hideFloor(value) {
    this._hideFloor = value;
    this._rebuildRoom = true;
  }

  public get hideWalls() {
    return this._hideWalls;
  }

  public set hideWalls(value) {
    this._hideWalls = value;
    this._rebuildRoom = true;
  }

  public get hideTileCursor() {
    return this._hideTileCursor;
  }

  public set hideTileCursor(value) {
    this._hideTileCursor = value;
    this._rebuildRoom = true;
  }

  public get wallTexture() {
    return this._wallTexture;
  }

  public set wallTexture(value) {
    this._wallTexture = value;
    this._refreshRoom = true;
  }

  public get floorTexture() {
    return this._floorTexture;
  }

  public set floorTexture(value) {
    this._floorTexture = value;
    this._refreshRoom = true;
  }

  public get wallHeight() {
    return this._wallHeight;
  }

  public set wallHeight(value) {
    this._wallHeight = value;
    this._refreshRoom = true;
  }

  public get tileHeight() {
    return this._tileHeight;
  }

  public set tileHeight(value) {
    this._tileHeight = value;
    this._refreshRoom = true;
  }

  public get wallDepth() {
    return this._borderWidth;
  }

  public set wallDepth(value) {
    this._borderWidth = value;
    this._refreshRoom = true;
  }

  public get roomBounds() {
    const hasWalls = this.hideWalls || this.hideFloor;

    const minOffsetY = hasWalls ? 0 : -this._wallHeight - this._borderWidth;
    const minXOffset = hasWalls ? 0 : -this._borderWidth;
    const maxOffsetX = hasWalls ? 0 : this._borderWidth;
    const maxOffsetY = hasWalls ? 0 : this._tileHeight;

    return {
      minX: this._tileMapBounds.minX + minXOffset,
      maxX: this._tileMapBounds.maxX + maxOffsetX,
      minY: this._tileMapBounds.minY + minOffsetY,
      maxY: this._tileMapBounds.maxY + maxOffsetY,
    };
  }

  public get rectangle(): Rectangle {
    return {
      x: this.x,
      y: this.y,
      width: this.roomBounds.maxX - this.roomBounds.minX,
      height: this.roomBounds.maxY - this.roomBounds.minY,
    };
  }

  public get wallLeftColor() {
    return this._wallLeftColor;
  }

  public set wallLeftColor(value) {
    this._wallLeftColor = value;
    this._refreshRoom = true;
  }

  public get wallRightColor() {
    return this._wallRightColor;
  }

  public set wallRightColor(value) {
    this._wallRightColor = value;
    this._refreshRoom = true;
  }

  public get wallTopColor() {
    return this._wallTopColor;
  }

  public set wallTopColor(value) {
    this._wallTopColor = value;
    this._refreshRoom = true;
  }

  public get tileLeftColor() {
    return this._tileLeftColor;
  }

  public set tileLeftColor(value) {
    this._tileLeftColor = value;
    this._refreshRoom = true;
  }

  public get tileRightColor() {
    return this._tileRightColor;
  }

  public set tileRightColor(value) {
    this._tileRightColor = value;
    this._refreshRoom = true;
  }

  public get tileTopColor() {
    return this._tileTopColor;
  }

  public set tileTopColor(value) {
    this._tileTopColor = value;
    this._refreshRoom = true;
  }

  public get onActiveTileChange() {
    return this._onActiveTileChange.asObservable();
  }

  public get onActiveWallChange() {
    return this._onActiveWallChange.asObservable();
  }

  public get container() {
    return this._primaryLayer;
  }

  public get behindWallContainer() {
    return this._behindWallLayer;
  }

  public get landscapeContainer() {
    return this._landscapeLayer;
  }

  public get floorContainer() {
    return this._tileLayer;
  }

  public get wallContainer() {
    return this._wallLayer;
  }

  destroy() {
    super.destroy();
    this._destroyAllSprites();
  }

  addMask(id: string, element: PIXI.Sprite): MaskNode {
    /*
    const existing = this._masks.get(id);
    const current =
      this._masks.get(id) ??
      new RoomLandscapeMaskSprite({
        renderer: this._application.renderer,
        roomBounds: this.roomBounds,
      });

    current.addSprite(element);
    this._primaryLayer.addChild(current);

    if (existing == null) {
      this._masks.set(id, current);
      this._updateParts();
    }

    return {
      update: () => current.updateSprite(element),
      remove: () => current.removeSprite(element),
      sprite: element,
    };*/

    return {
      update: () => {
        // Nothing
      },
      remove: () => {
        // Nothing
      },
      sprite: element,
    };
  }

  public getScreenPosition(roomX: number, roomY: number, roomZ: number) {
    return this._getPosition(roomX, roomY, roomZ);
  }

  private _getCurrentRoomPartData(): RoomPartData {
    return {
      borderWidth: this._borderWidth,
      tileHeight: this._tileHeight,
      wallHeight: this._getLargestWallHeight(),
      wallLeftColor: this._wallLeftColor ?? 0x91949f,
      wallRightColor: this._wallRightColor ?? 0xbbbecd,
      wallTopColor: this._wallTopColor ?? 0x70727b,
      tileLeftColor: this._tileLeftColor ?? 0x838357,
      tileRightColor: this._tileRightColor ?? 0x666644,
      tileTopColor: this._tileTopColor ?? 0x989865,
      tileTexture: this._floorTexture ?? PIXI.Texture.WHITE,
      wallTexture: this._wallTexture ?? PIXI.Texture.WHITE,
      masks: this._masks,
    };
  }

  public _setCache(cache: boolean) {
    return;
    [this._tileLayer, this._wallLayer].forEach(
      (container) => (container.cacheAsBitmap = cache)
    );
  }

  private _getLargestWallHeight() {
    return this.parsedTileMap.largestDiff * 32 + this._wallHeight;
  }

  private _destroyAllSprites() {
    [...this._tileCursors, ...this._tiles, ...this._walls].forEach((part) =>
      part.destroy()
    );

    this._tileCursors = [];
    this._tiles = [];
    this._walls = [];
  }

  private _updateHeightmap() {
    this._destroyAllSprites();

    for (let y = 0; y < this.parsedTileMap.parsedTileTypes.length; y++) {
      for (let x = 0; x < this.parsedTileMap.parsedTileTypes[y].length; x++) {
        const cell = this.parsedTileMap.parsedTileTypes[y][x];

        this._createHeightmapElement(cell, x, y);
      }
    }

    this._updateParts();

    this._positionalContainer.x = -this.roomBounds.minX;
    this._positionalContainer.y = -this.roomBounds.minY;
  }

  private _updateParts() {
    this._setCache(false);
    const currentRoomPartData = this._getCurrentRoomPartData();
    [...this._tiles, ...this._walls, ...this._parts].forEach((tile) =>
      tile.update(currentRoomPartData)
    );
    this._setCache(true);
  }

  private _createHeightmapElement(
    element: ParsedTileType,
    x: number,
    y: number
  ) {
    switch (element.type) {
      case "wall":
        this._createWallElement(element, x, y, element.height);
        break;

      case "tile":
        this._createTileElement(x, y, element.z);
        break;

      case "door":
        this._createDoor(x, y, element.z);
        break;

      case "stairs":
        this._createStair(x, y, element.z, element.kind);
        break;

      case "stairCorner":
        this._createStairCorner(x, y, element.z, element.kind);
        break;
    }
  }

  private _createStairCorner(
    x: number,
    y: number,
    z: number,
    kind: "left" | "front" | "right"
  ) {
    const stair = new StairCorner({ type: kind });
    const position = this._getPosition(x, y, z);

    stair.x = position.x;
    stair.y = position.y;

    this._tiles.push(stair);
    this._tileLayer.addChild(stair);

    this._createTileCursor(x, y, z);
    this._createTileCursor(x, y, z + 1);
  }

  private _createStair(x: number, y: number, z: number, direction: 2 | 0) {
    const stair = new Stair({
      tileHeight: this._tileHeight,
      direction,
    });
    const position = this._getPosition(x, y, z);

    stair.x = position.x;
    stair.y = position.y;

    this._tiles.push(stair);
    this._tileLayer.addChild(stair);

    this._createTileCursor(x, y, z);
    this._createTileCursor(x, y, z + 1);
  }

  private _createDoor(x: number, y: number, z: number) {
    this._createTileElement(x, y, z, this._behindWallLayer);
    this._createLeftWall(x, y, z, { hideBorder: false, cutawayHeight: 90 });
  }

  private shouldShowBorders (x: number, y: number) : {
    showLeftBorder: boolean;
    showRightBorder: boolean;
} {
    let bottomTile;
    let rightTile;
    const tileMap = this.parsedTileMap.parsedTileTypes;
    const currentTile = tileMap[y][x];

    if (
      tileMap[y + 1] !== undefined &&
      tileMap[y + 1][x] !== undefined
    ) {
      bottomTile = tileMap[y + 1][x];
    }

    if (tileMap[y][x + 1] !== undefined) {
      rightTile = tileMap[y][x + 1];
    }

    return {
      showLeftBorder: (
        !Boolean(bottomTile) ||
        ["stairs", "stairCorner", "door", "hidden"].includes(bottomTile?.type as string) ||
        // @ts-ignore
        (bottomTile?.type as string == 'tile' && bottomTile?.z != currentTile.z)
      ),
      showRightBorder: (
        !Boolean(rightTile) ||
        ["stairs", "stairCorner", "door", "hidden"].includes(rightTile?.type as string) ||
        // @ts-ignore
        (rightTile?.type as string == 'tile' && rightTile?.z != currentTile.z)
      )
    } 
  }

  private _createTileElement(
    x: number,
    y: number,
    z: number,
    container?: PIXI.Container
  ) {
    if (this._hideFloor) return;

    const showBorders = this.shouldShowBorders(x, y);

    const tile = new Tile({ color: "#eeeeee", tileHeight: this._tileHeight, showBorders });
    
    if (this.testMode) {
      tile.interactive = true;
      tile.on('pointerover', () => {
        const { x: posX, y: posY } = this._getPosition(x, y, z);

        this.tileCursor.visible = true;
        this.tileCursor.x = posX;
        this.tileCursor.y = posY;
        this.tileCursor.zIndex = getZOrder(x, y, z) - 1000;
      });
      tile.on('pointerout', () => {
        this.tileCursor.visible = false;
      });
    }

    const xEven = x % 2 === 0;
    const yEven = y % 2 === 0;

    tile.tilePositions = new PIXI.Point(xEven ? 32 : 0, yEven ? 32 : 0);

    const position = this._getPosition(x, y, z);

    tile.x = position.x;
    tile.y = position.y;

    (container ?? this._tileLayer).addChild(tile);
    this._tiles.push(tile);

    if (!this.testMode) {
      this._createTileCursor(x, y, z, container);
    }
  }

  private createCursor () {
    // @ts-ignore
    this.points = {
      p1: { x: 0, y: 16 },
      p2: { x: 32, y: 0 },
      p3: { x: 64, y: 16 },
      p4: { x: 32, y: 32 },
    };
    this.tileCursor.visible = false;
    this.drawBorder(this.tileCursor, 0x000000, 0.33, 0);
    this.drawBorder(this.tileCursor, 0xa7d1e0, 1, -2);
    this.drawBorder(this.tileCursor, 0xffffff, 1, -3);

    this._primaryLayer.addChild(this.tileCursor);
  }

   drawBorder(
    graphics: PIXI.Graphics,
    color: number,
    alpha = 1,
    offsetY: number
  ) {
    graphics.beginFill(color, alpha);
    // @ts-ignore
    graphics.moveTo(this.points.p1.x, this.points.p1.y + offsetY);
    // @ts-ignore
    graphics.lineTo(this.points.p2.x, this.points.p2.y + offsetY);
    // @ts-ignore
    graphics.lineTo(this.points.p3.x, this.points.p3.y + offsetY);
    // @ts-ignore
    graphics.lineTo(this.points.p4.x, this.points.p4.y + offsetY);
    graphics.endFill();
  
    graphics.beginHole();
    // @ts-ignore
    graphics.moveTo(this.points.p1.x + 6, this.points.p1.y + offsetY);
    // @ts-ignore
    graphics.lineTo(this.points.p2.x, this.points.p2.y + 3 + offsetY);
    // @ts-ignore
    graphics.lineTo(this.points.p3.x - 6, this.points.p3.y + offsetY);
    // @ts-ignore
    graphics.lineTo(this.points.p4.x, this.points.p4.y - 3 + offsetY);
    graphics.endHole();
  }

  private _createTileCursor(
    x: number,
    y: number,
    z: number,
    container?: PIXI.Container
  ) {
    if (this._hideTileCursor) return;

    const position: RoomPosition = { roomX: x, roomY: y, roomZ: z };
    const cursor = new TileCursor(
      this._eventManager,
      position,
      (pos, event) => {
        this._onTileClick.next({position, event});
      },
      () => {
        this._onActiveTileChange.next(position);
      },
      () => {
        this._onActiveTileChange.next(undefined);
      }
    );

    const { x: posX, y: posY } = this._getPosition(x, y, z);

    cursor.x = posX;
    cursor.y = posY;
    cursor.zIndex = getZOrder(x, y, z) - 1000;

    this._tileCursors.push(cursor);
    (container ?? this._primaryLayer).addChild(cursor);
  }

  private _handleTick = () => {
    if (this._rebuildRoom) {
      this._rebuildRoom = false;
      this._updateHeightmap();
    }

    if (this._refreshRoom) {
      this._refreshRoom = false;
      this._updateParts();
    }
  };

  private _createRightWall(
    roomX: number,
    roomY: number,
    roomZ: number,
    options: { hideBorder?: boolean }
  ) {
    const wall = new WallRight({
      hideBorder: options.hideBorder ?? false,
      onMouseMove: (event) => {
        this._onActiveWallChange.next({
          roomX,
          roomY,
          offsetX: -event.offsetX - 16,
          offsetY:
            event.offsetY / 2 +
            this._wallHeight / 2 -
            event.offsetX / 4 +
            roomZ * 16 -
            8,
          wall: "r",
        });
      },
      onMouseOut: () => {
        this._onActiveWallChange.next(undefined);
      },
      hitAreaContainer: this._wallHitAreaLayer,
    });

    const { x, y } = this._getPosition(roomX, roomY + 1, roomZ);
    wall.x = x + 32;
    wall.y = y;
    wall.roomZ = roomZ;

    this._wallLayer.addChild(wall);
    this._walls.push(wall);
  }

  private _createLeftWall(
    roomX: number,
    roomY: number,
    roomZ: number,
    {
      hideBorder = false,
      cutawayHeight,
    }: { hideBorder?: boolean; cutawayHeight?: number }
  ) {
    if (this._hideWalls) return;

    const wall = new WallLeft({
      hideBorder,
      onMouseMove: (event) => {
        this._onActiveWallChange.next({
          roomX,
          roomY,
          offsetX: event.offsetX,
          offsetY:
            event.offsetY / 2 +
            this._wallHeight / 2 -
            event.offsetX / 4 +
            roomZ * 16,
          wall: "l",
        });
      },
      onMouseOut: () => {
        this._onActiveWallChange.next(undefined);
      },
      hitAreaContainer: this._wallHitAreaLayer,
      cutawayHeight: cutawayHeight,
    });

    const { x, y } = this._getPosition(roomX + 1, roomY, roomZ);
    wall.x = x;
    wall.y = y;
    wall.roomZ = roomZ;

    this._wallLayer.addChild(wall);
    this._walls.push(wall);
  }

  private _createOuterBorder(roomX: number, roomY: number, roomZ: number) {
    const wall = new WallOuterCorner();

    const { x, y } = this._getPosition(roomX + 1, roomY, roomZ);
    wall.x = x;
    wall.y = y;
    wall.roomZ = roomZ;

    this._wallLayer.addChild(wall);
    this._walls.push(wall);
  }

  private _createWallElement(
    element: ParsedTileWall,
    x: number,
    y: number,
    z: number
  ) {
    if (this._hideWalls || this._hideFloor) return;

    switch (element.kind) {
      case "colWall":
        this._createRightWall(x, y, z, { hideBorder: element.hideBorder });
        break;

      case "rowWall":
        this._createLeftWall(x, y, z, { hideBorder: element.hideBorder });
        break;

      case "innerCorner":
        this._createRightWall(x, y, z, { hideBorder: false });
        this._createLeftWall(x, y, z, { hideBorder: true });
        break;

      case "outerCorner":
        this._createOuterBorder(x, y, z);
        break;
    }
  }

  private _getPosition(
    roomX: number,
    roomY: number,
    roomZ: number
  ): { x: number; y: number } {
    const getBasePosition = () => {
      return { x: roomX, y: roomY };
    };

    const { x, y } = getBasePosition();

    const base = 32;

    // TODO: Right now we are subtracting the tileMapBounds here.
    // This is so the landscapes work correctly. This has something with the mask position being negative for some walls.
    // This fixes it for now.
    const xPos = x * base - y * base;
    const yPos = x * (base / 2) + y * (base / 2);

    return {
      x: xPos,
      y: yPos - roomZ * 32,
    };
  }
}
