import {
  Block,
  Link,
  Comment,
  Signer,
  Tag,
  VersionStore,
  GraphStore,
  BlockStore,
  LinkCodec,
  ValueCodec,
  itemListFactory,
  ItemList,
  verify as verifySignature,
  graphPackerFactory,
  versionStoreFactory,
  graphStoreFactory,
  memoryBlockStoreFactory,
  MemoryBlockStore,
} from "@ubiquify/core";
import {
  RelayClientBasic,
  relayClientBasicFactory,
  BasicPushResponse,
} from "@ubiquify/cyclone";
import base64 from "base64-js";

export const CHUNK_SIZE_48KB = 1024 * 48;
export const CHUNK_SIZE_128KB = 1024 * 128;
export const CHUNK_SIZE_256KB = 1024 * 256;
export const CHUNK_SIZE_512KB = 1024 * 512;
export const CHUNK_SIZE_1MB = 1024 * 1024;
export const CHUNK_SIZE_DEFAULT = CHUNK_SIZE_256KB;

export enum MediaNodeKeys {
  ID = 10,
  COMMENT = 20,
  CREATED_AT = 30,
  PRIORITY = 40,
  MEDIA_TYPE = 50,
  MEDIA_DATA = 60,
  MEDIA_NAME = 70,
}

export enum MediaSystemKeys {
  NAME = 7,
  MEDIA_STORE_VERSION_STORE_ROOT = 8,
  MEDIA_STORE_CURRENT_ROOT = 9,
}

export interface Media {
  name: string;
  mimeType: string;
  data: Uint8Array;
}

export interface MediaNode {
  id: string;
  createdAt: number;
  deletedAt?: number;
  priority?: number;
  comment: string;
  media: Media;
}

export interface ContentAddressable {
  versionStoreId: () => string;
  versionStoreRoot: () => Link;
  currentRoot: () => Link;
  getVersionStore: () => VersionStore;
  verify: ({
    subtle,
    publicKey,
  }: {
    subtle: SubtleCrypto;
    publicKey: CryptoKey;
  }) => Promise<boolean>;
}

export interface ContentAddressableCollection<T> extends ContentAddressable {
  checkout: (versionRoot: Link) => ContentAddressableCollection<T>;
  add: (mediaNode: T) => void;
  getByIndexLoaded: (index: number) => T | undefined;
  getByIndexAdded: (index: number) => T | undefined;
  loadedSize: () => number;
  addedSize: () => number;
  persistedSize: () => Promise<number>;
  valuesLoaded: () => T[];
  valuesAdded: () => T[];
  forEachLoaded: (
    callback: (mediaNode: T, index: number, array: T[]) => void
  ) => void;
  forEachAdded: (
    callback: (mediaNode: T, index: number, array: T[]) => void
  ) => void;
  load: ({
    startIndex,
    itemCount,
  }: {
    startIndex?: number;
    itemCount?: number;
  }) => Promise<T[]>;
  commit: ({
    comment,
    tags,
    signer,
  }: {
    comment?: Comment;
    tags?: Tag[];
    signer?: Signer;
  }) => Promise<{
    versionStoreId: string;
    versionStoreRoot: Link;
    currentRoot: Link;
  }>;
  push: (relayUrl: string) => Promise<BasicPushResponse>;
  pull: (relayUrl: string) => Promise<void>;
  exportCurrentVersion: () => Promise<Block>;
  exportComplete: () => Promise<Block>;
}

export interface NamedContentAddressableCollection<T>
  extends ContentAddressableCollection<T> {
  name: string;
}

export interface MediaCollection
  extends ContentAddressableCollection<MediaNode> {}

export interface NamedMediaCollection
  extends NamedContentAddressableCollection<MediaNode> {}

export interface MediaSystem
  extends ContentAddressableCollection<
    NamedContentAddressableCollection<MediaNode>
  > {
  getByNameLoaded: (name: string) => NamedMediaCollection[];
  getByNameAdded: (name: string) => NamedMediaCollection[];
  commitCollection: ({
    collectionName,
    comment,
    tags,
    signer,
  }: {
    collectionName: string;
    comment?: Comment;
    tags?: Tag[];
    signer?: Signer;
  }) => Promise<{
    versionStoreId: string;
    versionStoreRoot: Link;
    currentRoot: Link;
  }>;
  areRemoteUpdatesForLoadedCollection: ({
    name,
    relayUrl,
  }: {
    name: string;
    relayUrl: string;
  }) => Promise<boolean>;
}

export interface MediaSystemView {
  add: (name: string, mediaCollection: MediaCollection) => void;
  getByName(name: string): Promise<NamedMediaCollection | undefined>;
  commit: ({
    collectionName,
    comment,
    tags,
    signer,
  }: {
    collectionName: string;
    comment?: Comment;
    tags?: Tag[];
    signer?: Signer;
  }) => Promise<{
    versionStoreId: string;
    versionStoreRoot: Link;
    currentRoot: Link;
  }>;
  load: ({
    startIndex,
    itemCount,
  }: {
    startIndex?: number;
    itemCount?: number;
  }) => Promise<NamedMediaCollection[]>;
}

export interface Versioned<T> {
  version: string | undefined;
  model: T;
}

export const abstractFactory = <E, C extends ContentAddressableCollection<E>>(
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
  },
  {
    loaded,
    added,
  }: {
    loaded: Versioned<E>[];
    added: E[];
  }
): C => {
  const add = (elem: E) => {
    added.push(elem);
  };

  const getByIndexLoaded = (index: number): E | undefined => {
    return loaded[index].model;
  };

  const getByIndexAdded = (index: number): E | undefined => {
    return added[index];
  };

  const loadedSize = (): number => {
    return loaded.length;
  };

  const addedSize = (): number => {
    return added.length;
  };

  const persistedSize = async (): Promise<number> => {
    if (versionStore.currentRoot() === undefined) {
      return 0;
    }
    const itemList: ItemList = itemListFactory(versionStore, graphStore);
    const len: number = await itemList.length();
    return len;
  };

  const valuesLoaded = (): E[] => {
    return loaded.map((versioned) => versioned.model);
  };

  const valuesAdded = (): E[] => {
    return added;
  };

  const forEachLoaded = (
    callback: (elem: E, index: number, array: E[]) => void
  ): void => {
    loaded.map((versioned) => versioned.model).forEach(callback);
  };

  const forEachAdded = (
    callback: (elem: E, index: number, array: E[]) => void
  ): void => {
    added.forEach(callback);
  };

  const versionStoreRoot = () => {
    return versionStore.versionStoreRoot();
  };

  const versionStoreId = () => {
    return versionStore.id();
  };

  const currentRoot = () => {
    return versionStore.currentRoot();
  };

  const push = async (relayUrl: string): Promise<BasicPushResponse> => {
    const relayClient: RelayClientBasic = relayClientBasicFactory(
      {
        chunk,
        chunkSize,
        linkCodec,
        valueCodec,
        blockStore,
        incremental: true,
      },
      {
        baseURL: relayUrl,
      }
    );

    const response: BasicPushResponse = await relayClient.push(
      versionStoreRoot(),
      currentRoot()
    );
    return response;
  };

  const pull = async (relayUrl: string): Promise<void> => {
    const relayClient: RelayClientBasic = relayClientBasicFactory(
      {
        chunk,
        chunkSize,
        linkCodec,
        valueCodec,
        blockStore,
        incremental: true,
      },
      {
        baseURL: relayUrl,
      }
    );
    const response = await relayClient.pull(
      versionStoreId(),
      versionStoreRoot()
    );
    if (response !== undefined) {
      const {
        versionStore: versionStoreIncoming,
        graphStore: graphStoreIncoming,
      } = response;
      const { version, index } = await versionStoreIncoming.versionGet();
      await versionStore.versionSet({ version, index });
    }
  };

  const verify = async ({
    subtle,
    publicKey,
  }: {
    subtle: SubtleCrypto;
    publicKey: CryptoKey;
  }): Promise<boolean> => {
    const { version } = await versionStore.versionGet();
    return await verifySignature({
      subtle,
      publicKey,
      root: version.root,
      signature: base64.toByteArray(version.details.signature),
    });
  };

  const exportCurrentVersion = async (): Promise<Block> => {
    const { packGraphVersion } = graphPackerFactory(linkCodec);
    const bundle: Block = await packGraphVersion(currentRoot(), blockStore);
    return bundle;
  };

  const exportComplete = async (): Promise<Block> => {
    const { packGraphComplete } = graphPackerFactory(linkCodec);
    const bundle: Block = await packGraphComplete(
      versionStoreRoot(),
      blockStore,
      chunk,
      valueCodec
    );
    return bundle;
  };

  const getVersionStore = (): VersionStore => {
    return versionStore;
  };

  return {
    getVersionStore,
    add,
    getByIndexLoaded,
    getByIndexAdded,
    loadedSize,
    addedSize,
    persistedSize,
    valuesLoaded,
    valuesAdded,
    forEachLoaded,
    forEachAdded,
    versionStoreRoot,
    versionStoreId,
    currentRoot,
    push,
    pull,
    verify,
    exportCurrentVersion,
    exportComplete,
  } as C;
};

export const pullContentAddressableCollection = async <
  E,
  C extends ContentAddressableCollection<E>
>(
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
  },
  collectionFactory: (
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
  ) => C
): Promise<C | undefined> => {
  const relayClient: RelayClientBasic = relayClientBasicFactory(
    {
      chunk,
      chunkSize,
      linkCodec,
      valueCodec,
      blockStore,
      incremental: true,
    },
    {
      baseURL: relayUrl,
    }
  );
  const response = await relayClient.pull(versionStoreId);
  if (response !== undefined) {
    const { versionStore, graphStore } = response;
    const collection = collectionFactory(versionStore, graphStore, {
      chunk,
      chunkSize,
      linkCodec,
      valueCodec,
      blockStore,
    });
    return collection;
  } else {
    return undefined;
  }
};

export const retrieveContentAddressableCollection = async <
  E,
  C extends ContentAddressableCollection<E>
>(
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
  },
  collectionFactory: (
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
  ) => C
): Promise<C | undefined> => {
  const versionStore: VersionStore = await versionStoreFactory({
    storeRoot: versionStoreRoot,
    chunk,
    linkCodec,
    valueCodec,
    blockStore,
  });
  const graphStore = graphStoreFactory({
    chunk,
    linkCodec,
    valueCodec,
    blockStore,
  });
  const collection = collectionFactory(versionStore, graphStore, {
    chunk,
    chunkSize,
    linkCodec,
    valueCodec,
    blockStore,
  });
  return collection;
};

export const importContentAddressableCollectionVersion = async <
  E,
  C extends ContentAddressableCollection<E>
>(
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
  },
  collectionFactory: (
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
  ) => C
): Promise<C> => {
  const { restoreGraphVersion } = graphPackerFactory(linkCodec);
  const tempStore: MemoryBlockStore = memoryBlockStoreFactory();
  const { root: versionRoot } = await restoreGraphVersion(bundle, tempStore);
  tempStore.push(blockStore);
  const versionStore: VersionStore = await versionStoreFactory({
    versionRoot,
    chunk,
    linkCodec,
    valueCodec,
    blockStore,
  });
  const graphStore: GraphStore = graphStoreFactory({
    chunk,
    linkCodec,
    valueCodec,
    blockStore,
  });
  const collection = collectionFactory(versionStore, graphStore, {
    chunk,
    chunkSize,
    linkCodec,
    valueCodec,
    blockStore,
  });
  return collection;
};

export const importContentAddressableCollectionComplete = async <
  E,
  C extends ContentAddressableCollection<E>
>(
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
  },
  collectionFactory: (
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
  ) => C
): Promise<C> => {
  const { restoreGraphComplete } = graphPackerFactory(linkCodec);
  const tempStore: MemoryBlockStore = memoryBlockStoreFactory();
  const { versionStoreRoot, versionRoots } = await restoreGraphComplete(
    bundle,
    tempStore
  );
  tempStore.push(blockStore);
  const versionStore: VersionStore = await versionStoreFactory({
    storeRoot: versionStoreRoot,
    versionRoot: versionRoots[0],
    chunk,
    linkCodec,
    valueCodec,
    blockStore,
  });
  const graphStore: GraphStore = graphStoreFactory({
    chunk,
    linkCodec,
    valueCodec,
    blockStore,
  });
  const collection = collectionFactory(versionStore, graphStore, {
    chunk,
    chunkSize,
    linkCodec,
    valueCodec,
    blockStore,
  });
  return collection;
};
