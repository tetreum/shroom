import * as PIXI from "pixi.js";
import { Shroom } from "../Shroom";
import { BaseFurniture } from "./BaseFurniture";
import { IFurniture } from "./IFurniture";

export class FurnitureHelper {

    public static getFurniPreview (furniId: string, shroom: Shroom) : Promise<HTMLImageElement> {
        return new Promise((resolve, reject) => {
            const container = new PIXI.Container();

            BaseFurniture.fromShroom(shroom, container, {
                animation: "0",
                direction: 2,
                type: { type: furniId, kind: "type" },
                onLoad: () => {
                    const image = shroom.dependencies.application.renderer.plugins.extract.image(container);
     
                    image.onload = () => {
                        resolve(image);
                        container.destroy();
                    }
                },
            });
        });
    }

    public static async getFurniOptions(furni: IFurniture, shroom: Shroom): Promise<FurniOptions | undefined> {
        if (!furni.type) return; // If Furniture Type == Undefined, Return Undefined
        const info = await shroom.dependencies.furnitureData?.getInfo(furni.type);
        if (!info) return; // If FurnitureData Fetch Fails, Return Undefined
    
        const image = (await this.getFurniPreview(furni.type, shroom)).src;
        const validDirections = await furni.validDirections;
    
        return {
          name: info?.name,
          type: furni.type,
          description: info?.description,
          image,
    
          move: (callback) => { callback(); },
          rotate: () => {
            const currIndex = validDirections.indexOf(furni.direction);
            var nextDirection = 0;
    
            if (currIndex + 1 > validDirections.length) { nextDirection = validDirections[0]; }
            else { nextDirection = validDirections[currIndex + 1]; }
            furni.direction = nextDirection;
          },
          pickup: (callback) => { callback(); },
        };
    }
}

interface FurniOptions {
    name?: string;
    type: string;
    description?: string;
    image: string;
    move: (callback: () => void) => void;
    rotate: () => void;
    pickup: (callback: () => void) => void;
}
