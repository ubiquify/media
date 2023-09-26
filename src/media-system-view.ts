import { Tag, Link, Signer } from "@ubiquify/core";
import {
  MediaCollection,
  MediaSystem,
  MediaSystemView,
  NamedMediaCollection,
} from "./media";

export const createMediaSystemViewCurrent = async (
  mediaSystem: MediaSystem
): Promise<MediaSystemView> => {
  const getByName = async (
    name: string
  ): Promise<NamedMediaCollection | undefined> => {
    const added = mediaSystem.getByNameAdded(name);
    if (added.length > 0) {
      return added[added.length - 1];
    } else {
      const loaded = mediaSystem.getByNameLoaded(name);
      if (loaded.length > 0) {
        return loaded[loaded.length - 1];
      } else {
        return await getByNameLoaded(name);
      }
    }
  };

  const getByNameLoaded = async (
    name: string
  ): Promise<NamedMediaCollection | undefined> => {
    if (mediaSystem.currentRoot() === undefined) {
      return undefined;
    } else {
      const length = await mediaSystem.persistedSize();
      if (length === 0) {
        return undefined;
      }
      const batchSize = 10;
      const batches = Math.ceil(length / batchSize);
      for (let i = 0; i < batches; i++) {
        const startIndex = Math.max(length - batchSize * (i + 1), 0);
        const itemCount = Math.min(batchSize, length - startIndex);
        const mediaCollections = await mediaSystem.load({
          startIndex,
          itemCount,
        });
        mediaCollections.reverse();
        for (const mediaCollection of mediaCollections) {
          if (mediaCollection.name === name) {
            return mediaCollection;
          }
        }
      }
      return undefined;
    }
  };

  const add = (name: string, mediaCollection: MediaCollection): void => {
    const namedMediaCollection = {
      name,
      ...mediaCollection,
    };
    mediaSystem.add(namedMediaCollection);
  };

  const commit = async ({
    collectionName,
    comment,
    tags,
    signer,
  }: {
    collectionName: string;
    comment?: Comment;
    tags?: Tag[];
    signer?: Signer;
  }): Promise<{
    versionStoreId: string;
    versionStoreRoot: Link;
    currentRoot: Link;
  }> => {
    return {
      ...mediaSystem.commitCollection({
        collectionName,
        comment,
        tags,
        signer,
      }),
      verify: mediaSystem.verify,
    };
  };

  const load = ({
    startIndex,
    itemCount,
  }: {
    startIndex?: number;
    itemCount?: number;
  }): Promise<NamedMediaCollection[]> => {
    return mediaSystem.load({
      startIndex,
      itemCount,
    });
  };

  return {
    getByName,
    add,
    commit,
    load,
  };
};
