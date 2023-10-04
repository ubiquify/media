import {
  itemListFactory,
  VersionStore,
  GraphStore,
  ItemList,
  ItemValue,
  Item,
  Comment,
  Tag,
  Signer,
  LinkCodec,
  versionStoreFactory,
  ValueCodec,
  BlockStore,
  graphStoreFactory,
  Link,
  graphPackerFactory,
  memoryBlockStoreFactory,
} from "@ubiquify/core";

import {
  MediaCollection,
  MediaSystem,
  NamedMediaCollection,
  MediaSystemKeys,
  abstractFactory,
  retrieveContentAddressableCollection,
  pullContentAddressableCollection,
  Versioned,
  importContentAddressableCollectionVersion,
  importContentAddressableCollectionComplete,
} from "./media";

import { mediaCollectionFactory } from "./media-collection";
import {
  RelayClientPlumbing,
  relayClientPlumbingFactory,
} from "@ubiquify/cyclone";

export const mediaSystemFactory = (
  versionStore: VersionStore,
  graphStore: GraphStore,
  {
    chunk,
    chunkSize,
    linkCodec,
    valueCodec,
    blockStore,
  }: {
    chunk: (buffer: Uint8Array) => Uint32Array;
    chunkSize: number;
    linkCodec: LinkCodec;
    valueCodec: ValueCodec;
    blockStore: BlockStore;
  }
): MediaSystem => {
  const loaded: Versioned<NamedMediaCollection>[] = [];
  const added: NamedMediaCollection[] = [];

  const { restoreSingleIndex: restoreVersionStore } =
    graphPackerFactory(linkCodec);

  const functions = abstractFactory<NamedMediaCollection, MediaSystem>(
    versionStore,
    graphStore,
    {
      chunk,
      chunkSize,
      linkCodec,
      valueCodec,
      blockStore,
    },
    {
      loaded,
      added,
    }
  );

  const getByNameLoaded = (name: string): NamedMediaCollection[] => {
    const result = loaded
      .map((versioned) => versioned.model)
      .filter((coll) => coll.name === name);
    return result;
  };

  const getByNameAdded = (name: string): NamedMediaCollection[] => {
    const result = added.filter((coll) => coll.name === name);
    return result;
  };

  const commitCollection = async ({
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
    return commitInternal({
      collectionName,
      comment,
      tags,
      signer,
    });
  };

  const commit = async ({
    comment,
    tags,
    signer,
  }: {
    comment?: Comment;
    tags?: Tag[];
    signer?: Signer;
  }): Promise<{
    versionStoreId: string;
    versionStoreRoot: Link;
    currentRoot: Link;
  }> => {
    return commitInternal({
      comment,
      tags,
      signer,
    });
  };

  const commitInternal = async ({
    collectionName,
    comment,
    tags,
    signer,
  }: {
    collectionName?: string;
    comment?: Comment;
    tags?: Tag[];
    signer?: Signer;
  }): Promise<{
    versionStoreId: string;
    versionStoreRoot: Link;
    currentRoot: Link;
  }> => {
    const itemList: ItemList = itemListFactory(versionStore, graphStore);
    const tx = itemList.tx();
    await tx.start();
    let modified = false;
    for (const collection of added) {
      if (
        collection.currentRoot() !== undefined &&
        (collectionName === undefined || collectionName === collection.name)
      ) {
        const itemValue: ItemValue = new Map<number, any>();
        itemValue.set(MediaSystemKeys.NAME, collection.name);
        itemValue.set(
          MediaSystemKeys.MEDIA_STORE_VERSION_STORE_ROOT,
          linkCodec.encodeString(collection.versionStoreRoot())
        );
        itemValue.set(
          MediaSystemKeys.MEDIA_STORE_CURRENT_ROOT,
          linkCodec.encodeString(collection.currentRoot())
        );
        await tx.push(itemValue);
        modified = true;
      }
    }
    for (const versionedCollection of loaded) {
      const { version: originalVersion, model: collection } =
        versionedCollection;
      if (
        collection.currentRoot() !== undefined &&
        collection.currentRoot().toString() !== originalVersion &&
        (collectionName === undefined || collectionName === collection.name)
      ) {
        // if changed add the new version
        const itemValue: ItemValue = new Map<number, any>();
        itemValue.set(MediaSystemKeys.NAME, collection.name);
        itemValue.set(
          MediaSystemKeys.MEDIA_STORE_VERSION_STORE_ROOT,
          linkCodec.encodeString(collection.versionStoreRoot())
        );
        itemValue.set(
          MediaSystemKeys.MEDIA_STORE_CURRENT_ROOT,
          linkCodec.encodeString(collection.currentRoot())
        );
        await tx.push(itemValue);
        modified = true;
      }
    }
    if (modified) {
      await tx.commit({
        comment,
        tags,
        signer,
      });
    }
    added.length = 0;
    return {
      versionStoreId: functions.versionStoreId(),
      versionStoreRoot: functions.versionStoreRoot(),
      currentRoot: functions.currentRoot(),
    };
  };

  const load = async ({
    startIndex,
    itemCount,
  }: {
    startIndex?: number;
    itemCount?: number;
  }): Promise<NamedMediaCollection[]> => {
    loaded.length = 0;
    if (versionStore.currentRoot() === undefined) {
      return [];
    }
    const itemList: ItemList = itemListFactory(versionStore, graphStore);
    const len: number = await itemList.length();
    if (startIndex === undefined) {
      startIndex = 0;
    }
    if (itemCount === undefined) {
      itemCount = len;
    }
    if (startIndex < 0 || startIndex >= len) {
      throw new Error(`invalid start index: ${startIndex}`);
    }
    if (itemCount < 0 || startIndex + itemCount > len) {
      itemCount = len;
    }
    for (let i = startIndex; i < startIndex + itemCount; i++) {
      const item: Item = await itemList.get(i);
      const itemValue: ItemValue = item.value;
      const versionStoreRoot = linkCodec.parseString(
        itemValue.get(MediaSystemKeys.MEDIA_STORE_VERSION_STORE_ROOT)
      );
      const currentRoot = linkCodec.parseString(
        itemValue.get(MediaSystemKeys.MEDIA_STORE_CURRENT_ROOT)
      );
      const name: string = itemValue.get(MediaSystemKeys.NAME);
      const versionStoreNew: VersionStore = await versionStoreFactory({
        storeRoot: versionStoreRoot,
        versionRoot: currentRoot,
        chunk,
        linkCodec,
        valueCodec,
        blockStore,
      });
      const graphStoreNew = graphStoreFactory({
        chunk,
        linkCodec,
        valueCodec,
        blockStore,
      });
      const mediaCollection: MediaCollection = mediaCollectionFactory(
        versionStoreNew,
        graphStoreNew,
        {
          chunk,
          chunkSize,
          linkCodec,
          valueCodec,
          blockStore,
        }
      );
      const namedMediaCollection: NamedMediaCollection = {
        name,
        ...mediaCollection,
      };
      const versionedCollection: Versioned<NamedMediaCollection> = {
        version: currentRoot.toString(),
        model: namedMediaCollection,
      };
      loaded.push(versionedCollection);
    }
    return loaded.map((versioned) => versioned.model);
  };

  const areRemoteUpdatesForLoadedCollection = async ({
    name,
    relayUrl,
  }: {
    name: string;
    relayUrl: string;
  }): Promise<boolean> => {
    const localCollectionVersions: NamedMediaCollection[] =
      getByNameLoaded(name);
    if (localCollectionVersions.length !== 0) {
      const localCollectionId = localCollectionVersions[0].versionStoreId();
      const plumbing: RelayClientPlumbing = relayClientPlumbingFactory({
        baseURL: relayUrl,
      });
      try {
        const bytes = await plumbing.storePull(chunkSize, localCollectionId);
        if (bytes === undefined) {
          return false;
        }
        const tempStore: BlockStore = memoryBlockStoreFactory();
        const { root: relayVersionStoreRoot } = await restoreVersionStore(
          bytes,
          tempStore
        );
        const relayVersionStore: VersionStore = await versionStoreFactory({
          storeRoot: relayVersionStoreRoot,
          chunk,
          linkCodec,
          valueCodec,
          blockStore: tempStore,
        });
        const relayCurrentVersionRoot = relayVersionStore.currentRoot();
        for (const localCollectionVersion of localCollectionVersions) {
          const versionStoreLocal: VersionStore = await versionStoreFactory({
            storeRoot: localCollectionVersion.versionStoreRoot(),
            chunk,
            linkCodec,
            valueCodec,
            blockStore,
          });
          if (versionStoreLocal.includesVersion(relayCurrentVersionRoot)) {
            return false;
          }
        }
        return true;
      } catch (err) {
        console.log(err);
        return false;
      }
    } else return false;
  };

  const checkout = (versionRoot: Link): MediaSystem => {
    loaded.length = 0;
    functions.getVersionStore().checkout(versionRoot);
    return {
      ...functions,
      getByNameLoaded,
      getByNameAdded,
      commit,
      commitCollection,
      load,
      areRemoteUpdatesForLoadedCollection,
    };
  };

  return {
    ...functions,
    getByNameLoaded,
    getByNameAdded,
    commit,
    commitCollection,
    load,
    areRemoteUpdatesForLoadedCollection,
    checkout,
  };
};

export const pullMediaSystem = async (
  relayUrl: string,
  versionStoreId: string,
  {
    chunk,
    chunkSize,
    linkCodec,
    valueCodec,
    blockStore,
  }: {
    chunk: (buffer: Uint8Array) => Uint32Array;
    chunkSize: number;
    linkCodec: LinkCodec;
    valueCodec: ValueCodec;
    blockStore: BlockStore;
  }
): Promise<MediaSystem | undefined> => {
  return pullContentAddressableCollection<MediaCollection, MediaSystem>(
    relayUrl,
    versionStoreId,
    {
      chunk,
      chunkSize,
      linkCodec,
      valueCodec,
      blockStore,
    },
    mediaSystemFactory
  );
};

export const retrieveMediaSystem = async (
  versionStoreRoot: Link,
  {
    chunk,
    chunkSize,
    linkCodec,
    valueCodec,
    blockStore,
  }: {
    chunk: (buffer: Uint8Array) => Uint32Array;
    chunkSize: number;
    linkCodec: LinkCodec;
    valueCodec: ValueCodec;
    blockStore: BlockStore;
  }
): Promise<MediaSystem | undefined> => {
  return retrieveContentAddressableCollection<MediaCollection, MediaSystem>(
    versionStoreRoot,
    {
      chunk,
      chunkSize,
      linkCodec,
      valueCodec,
      blockStore,
    },
    mediaSystemFactory
  );
};

export const importMediaSystemVersion = async (
  bundle: Uint8Array,
  {
    chunk,
    chunkSize,
    linkCodec,
    valueCodec,
    blockStore,
  }: {
    chunk: (buffer: Uint8Array) => Uint32Array;
    chunkSize: number;
    linkCodec: LinkCodec;
    valueCodec: ValueCodec;
    blockStore: BlockStore;
  }
): Promise<MediaSystem> => {
  return importContentAddressableCollectionVersion<
    MediaCollection,
    MediaSystem
  >(
    bundle,
    {
      chunk,
      chunkSize,
      linkCodec,
      valueCodec,
      blockStore,
    },
    mediaSystemFactory
  );
};

export const importMediaSystemComplete = async (
  bundle: Uint8Array,
  {
    chunk,
    chunkSize,
    linkCodec,
    valueCodec,
    blockStore,
  }: {
    chunk: (buffer: Uint8Array) => Uint32Array;
    chunkSize: number;
    linkCodec: LinkCodec;
    valueCodec: ValueCodec;
    blockStore: BlockStore;
  }
): Promise<MediaSystem> => {
  return importContentAddressableCollectionComplete<
    MediaCollection,
    MediaSystem
  >(
    bundle,
    {
      chunk,
      chunkSize,
      linkCodec,
      valueCodec,
      blockStore,
    },
    mediaSystemFactory
  );
};
