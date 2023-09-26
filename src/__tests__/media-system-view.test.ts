import {
  BlockStore,
  LinkCodec,
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
  createMediaSystemViewCurrent,
  MediaSystemView,
} from "../index";

const chunkSize = 512;
const { chunk } = chunkerFactory(chunkSize, compute_chunks);
const linkCodec: LinkCodec = linkCodecFactory();
const valueCodec: ValueCodec = valueCodecFactory();

describe("media system view", function () {
  test("media current system view", async () => {
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
    mediaCollection.add(mediaNode0);

    const systemView: MediaSystemView = await createMediaSystemViewCurrent(
      mediaSystem
    );

    systemView.add("/test", mediaCollection);

    // commit collection
    await mediaCollection.commit({});
    const {
      currentRoot,
      versionStoreId,
      versionStoreRoot: rootStore1,
    } = await mediaSystem.commitCollection({ collectionName: "/test" });

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

    mediaCollection.add(mediaNode1);
    systemView.add("/test", mediaCollection);

    // commit collection
    await mediaCollection.commit({});
    const { versionStoreRoot: rootStore2 } = await mediaSystem.commitCollection(
      { collectionName: "/test" }
    );

    const viewMediaCollection = await systemView.getByName("/test");

    expect(viewMediaCollection).not.toBe(undefined);

    expect(mediaCollection.currentRoot()).toStrictEqual(
      viewMediaCollection.currentRoot()
    );

    // check that getByName returns the same collection
    const viewMediaCollection2 = await systemView.getByName("/test");

    viewMediaCollection2.add(mediaNode1);

    expect(viewMediaCollection2).not.toBe(undefined);

    const viewMediaCollection3 = await systemView.getByName("/test");

    const valuesAdded = viewMediaCollection3.valuesAdded();

    expect(valuesAdded).toStrictEqual([mediaNode1]);

    const mediaNodes = await viewMediaCollection.load({});

    expect(mediaNodes).toStrictEqual([mediaNode0, mediaNode1]);
  });
});
