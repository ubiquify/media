import {
  BlockStore,
  LinkCodec,
  MemoryBlockStore,
  ValueCodec,
  VersionStore,
  chunkerFactory,
  graphStoreFactory,
  linkCodecFactory,
  memoryBlockStoreFactory,
  valueCodecFactory,
  versionStoreFactory,
} from "@ubiquify/core";
import { compute_chunks } from "@dstanesc/wasm-chunking-fastcdc-node";
import {
  MediaNode,
  MediaCollection,
  MediaSystem,
  mediaSystemFactory,
  mediaCollectionFactory,
  NamedMediaCollection,
} from "../index";

const chunkSize = 512;
const { chunk } = chunkerFactory(chunkSize, compute_chunks);
const linkCodec: LinkCodec = linkCodecFactory();
const valueCodec: ValueCodec = valueCodecFactory();

describe("media system", function () {
  test("media system api", async () => {
    // prepare media collection & media system storage structures
    const blockStore: BlockStore = memoryBlockStoreFactory();
    const versionStoreSystem: VersionStore = await versionStoreFactory({
      chunk,
      linkCodec,
      valueCodec,
      blockStore,
    });
    const graphStoreSystem = graphStoreFactory({
      chunk,
      linkCodec,
      valueCodec,
      blockStore,
    });
    const mediaSystem: MediaSystem = mediaSystemFactory(
      versionStoreSystem,
      graphStoreSystem,
      {
        chunk,
        chunkSize,
        linkCodec,
        valueCodec,
        blockStore,
      }
    );
    const versionStoreCollection: VersionStore = await versionStoreFactory({
      chunk,
      linkCodec,
      valueCodec,
      blockStore,
    });
    const graphStoreCollection = graphStoreFactory({
      chunk,
      linkCodec,
      valueCodec,
      blockStore,
    });

    const mediaCollection: MediaCollection = mediaCollectionFactory(
      versionStoreCollection,
      graphStoreCollection,
      {
        chunk,
        chunkSize,
        linkCodec,
        valueCodec,
        blockStore,
      }
    );

    // add nodes to collection
    const mediaNode0: MediaNode = {
      id: "abc",
      createdAt: 12345,
      comment: "test",
      media: {
        name: "test",
        mimeType: "text/plain",
        data: new Uint8Array([1, 2, 3, 4, 5]),
      },
    };
    const mediaNode1: MediaNode = {
      id: "def",
      createdAt: 12345,
      comment: "test",
      media: {
        name: "test",
        mimeType: "text/plain",
        data: new Uint8Array([1, 2, 3, 4, 5]),
      },
    };

    mediaCollection.add(mediaNode0);
    mediaCollection.add(mediaNode1);

    // commit collection
    await mediaCollection.commit({});

    const emptyMedia: MediaCollection[] = mediaSystem.getByNameLoaded("/tmp");

    expect(emptyMedia.length).toBe(0);

    // create a named collection
    const namedMediaCollection: NamedMediaCollection = {
      name: "/tmp",
      ...mediaCollection,
    };

    // add named collection to media system
    mediaSystem.add(namedMediaCollection);

    // check properly added
    const mediaCollections: MediaCollection[] =
      mediaSystem.getByNameAdded("/tmp");

    expect(mediaCollections.length).toBe(1);

    // commit media system
    await mediaSystem.commitCollection({ collectionName: "/tmp" });

    // reload media system from blocks
    const namedMediaStores: NamedMediaCollection[] = await mediaSystem.load({});

    expect(namedMediaStores.length).toBe(1);

    // check expected content identifier
    expect(mediaSystem.currentRoot()).toStrictEqual(
      versionStoreSystem.currentRoot()
    );

    // reload first collection in the media system
    const mediaNodes = await namedMediaStores[0].load({});

    // check expected media nodes
    expect(mediaNodes).toStrictEqual([mediaNode0, mediaNode1]);
  });

  test("media system commit empty collection", async () => {
    const blockStore: MemoryBlockStore = memoryBlockStoreFactory();
    const versionStore: VersionStore = await versionStoreFactory({
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
    // create a media collection
    const mediaCollection: MediaCollection = mediaCollectionFactory(
      versionStore,
      graphStore,
      {
        chunk,
        chunkSize,
        linkCodec,
        valueCodec,
        blockStore,
      }
    );
    // commit empty collection
    await mediaCollection.commit({ comment: "test", tags: ["test"] });
    // expect no blocks persisted
    expect(blockStore.size()).toBe(0);
    const versionStoreSystem: VersionStore = await versionStoreFactory({
      chunk,
      linkCodec,
      valueCodec,
      blockStore,
    });
    const graphStoreSystem = graphStoreFactory({
      chunk,
      linkCodec,
      valueCodec,
      blockStore,
    });
    const mediaSystem: MediaSystem = mediaSystemFactory(
      versionStoreSystem,
      graphStoreSystem,
      {
        chunk,
        chunkSize,
        linkCodec,
        valueCodec,
        blockStore,
      }
    );
    const emptyMedia: MediaCollection[] = mediaSystem.getByNameLoaded("/tmp");
    expect(emptyMedia.length).toBe(0);
    // create a named collection
    const namedMediaCollection: NamedMediaCollection = {
      name: "/tmp",
      ...mediaCollection,
    };
    // add named collection to media system
    mediaSystem.add(namedMediaCollection);
    // check properly added
    const mediaCollections: MediaCollection[] =
      mediaSystem.getByNameAdded("/tmp");
    expect(mediaCollections.length).toBe(1);
    // commit media system
    await mediaSystem.commitCollection({ collectionName: "/tmp" });
    // expect no blocks persisted
    expect(blockStore.size()).toBe(0);
    // reload should find no collection
    const namedMediaStores: NamedMediaCollection[] = await mediaSystem.load({});
    expect(namedMediaStores.length).toBe(0);
  });
});
