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
  ValueCodec,
  BlockStore,
  Link,
} from "@ubiquify/core";

import {
  MediaNode,
  MediaCollection,
  MediaNodeKeys,
  abstractFactory,
  pullContentAddressableCollection,
  retrieveContentAddressableCollection,
  Versioned,
  importContentAddressableCollectionVersion,
  importContentAddressableCollectionComplete,
} from "./media";

const itemsToMediaNodes = async (items: Item[]): Promise<MediaNode[]> => {
  const mediaNodes: MediaNode[] = [];

  for (const item of items) {
    const itemValue: ItemValue = item.value;
    const priority = itemValue.get(MediaNodeKeys.PRIORITY);
    const mediaNode: MediaNode = {
      id: itemValue.get(MediaNodeKeys.ID),
      createdAt: itemValue.get(MediaNodeKeys.CREATED_AT),
      comment: itemValue.get(MediaNodeKeys.COMMENT),
      media: {
        name: itemValue.get(MediaNodeKeys.MEDIA_NAME),
        mimeType: itemValue.get(MediaNodeKeys.MEDIA_TYPE),
        data: itemValue.get(MediaNodeKeys.MEDIA_DATA),
      },
    };
    if (priority !== undefined) {
      mediaNode.priority = priority;
    }
    mediaNodes.push(mediaNode);
  }
  return mediaNodes;
};

export const mediaCollectionFactory = (
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
): MediaCollection => {
  const loaded: Versioned<MediaNode>[] = [];
  const added: MediaNode[] = [];

  const functions = abstractFactory<MediaNode, MediaCollection>(
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
    const itemList: ItemList = itemListFactory(versionStore, graphStore);
    const tx = itemList.tx();
    await tx.start();
    let modified = false;
    for (const mediaNode of added) {
      const itemValue: ItemValue = new Map<number, any>();
      itemValue.set(MediaNodeKeys.ID, mediaNode.id);
      itemValue.set(MediaNodeKeys.CREATED_AT, mediaNode.createdAt);
      if (mediaNode.priority !== undefined) {
        itemValue.set(MediaNodeKeys.PRIORITY, mediaNode.priority);
      }
      itemValue.set(MediaNodeKeys.COMMENT, mediaNode.comment);
      itemValue.set(MediaNodeKeys.MEDIA_NAME, mediaNode.media.name);
      itemValue.set(MediaNodeKeys.MEDIA_TYPE, mediaNode.media.mimeType);
      itemValue.set(MediaNodeKeys.MEDIA_DATA, mediaNode.media.data);
      await tx.push(itemValue);
      modified = true;
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
  }): Promise<MediaNode[]> => {
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
    const items: Item[] = await itemList.range(startIndex, itemCount);
    (await itemsToMediaNodes(items)).forEach((mediaNode) => {
      loaded.push({ model: mediaNode, version: undefined });
    });
    return loaded.map((versioned) => versioned.model);
  };

  const checkout = (versionRoot: Link): MediaCollection => {
    loaded.length = 0;
    functions.getVersionStore().checkout(versionRoot);
    return {
      ...functions,
      commit,
      load,
    };
  };

  return {
    ...functions,
    commit,
    load,
    checkout,
  };
};

export const pullMediaCollection = async (
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
): Promise<MediaCollection | undefined> => {
  return pullContentAddressableCollection<MediaNode, MediaCollection>(
    relayUrl,
    versionStoreId,
    {
      chunk,
      chunkSize,
      linkCodec,
      valueCodec,
      blockStore,
    },
    mediaCollectionFactory
  );
};

export const retrieveMediaCollection = async (
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
): Promise<MediaCollection | undefined> => {
  return retrieveContentAddressableCollection<MediaNode, MediaCollection>(
    versionStoreRoot,
    {
      chunk,
      chunkSize,
      linkCodec,
      valueCodec,
      blockStore,
    },
    mediaCollectionFactory
  );
};

export const importMediaCollectionVersion = async (
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
): Promise<MediaCollection> => {
  return importContentAddressableCollectionVersion<MediaNode, MediaCollection>(
    bundle,
    {
      chunk,
      chunkSize,
      linkCodec,
      valueCodec,
      blockStore,
    },
    mediaCollectionFactory
  );
};

export const importMediaCollectionComplete = async (
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
): Promise<MediaCollection> => {
  return importContentAddressableCollectionComplete<MediaNode, MediaCollection>(
    bundle,
    {
      chunk,
      chunkSize,
      linkCodec,
      valueCodec,
      blockStore,
    },
    mediaCollectionFactory
  );
};
