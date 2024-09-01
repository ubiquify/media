import {
  Block,
  BlockStore,
  Comment,
  LinkCodec,
  MemoryBlockStore,
  ValueCodec,
  Version,
  VersionStore,
  chunkerFactory,
  graphStoreFactory,
  linkCodecFactory,
  memoryBlockStoreFactory,
  valueCodecFactory,
  versionStoreFactory,
  Secrets,
  Secret,
  Cipher,
  cipherFactory,
  secretsFactory,
} from "@ubiquify/core";
import { compute_chunks } from "@dstanesc/wasm-chunking-fastcdc-node";
import {
  Media,
  MediaNode,
  MediaCollection,
  MediaSystem,
  mediaSystemFactory,
  mediaCollectionFactory,
  NamedMediaCollection,
  createMediaSystemViewCurrent,
  MediaSystemView,
  importMediaCollectionVersion,
  importMediaCollectionComplete,
} from "../index";
import crypto from "crypto";
const { subtle } = crypto.webcrypto;

// chunking settings
const chunkSize = 512;
const { chunk } = chunkerFactory(chunkSize, compute_chunks);

describe("media collection api", function () {
  let linkCodec: LinkCodec = linkCodecFactory();
  let valueCodec: ValueCodec;

  beforeAll(async () => {
    // use encrypted codecs
    const secretJwk = {
      key_ops: ["encrypt", "decrypt"],
      ext: true,
      kty: "oct",
      k: "uc937ZNW-RNe9HQB6yIo4Y9lLKMS8aFGe44P0zQLLbk",
      alg: "A256GCM",
      iv: "htb1eAW+Jognhg0vUPxe/Q==",
    };
    const secrets: Secrets = secretsFactory({ subtle });
    const secret = await secrets.importSecret(secretJwk);
    const cipher = cipherFactory({
      subtle,
      secret,
    });
    valueCodec = valueCodecFactory(cipher);
  });

  test("basic api", async () => {
    // prepare media collection storage structure
    const blockStore: BlockStore = memoryBlockStoreFactory();
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

    // check empty
    await mediaCollection.load({ startIndex: 0 });

    expect(mediaCollection.valuesLoaded()).toStrictEqual([]);

    // add media
    const mediaNode0: MediaNode = {
      id: "0",
      createdAt: 12345,
      comment: "test",
      media: {
        name: "test",
        mimeType: "text/plain",
        data: new Uint8Array([1, 2, 3, 4, 5]),
      },
    };
    const mediaNode1: MediaNode = {
      id: "1",
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

    // commit
    await mediaCollection.commit({ comment: "test", tags: ["test"] });

    // check expected content identifier
    expect(mediaCollection.currentRoot()).toStrictEqual(
      linkCodec.parseString(
        "bafkreihxgx4x4qrxe63sjfxtot6fziirxjxz5643pb7gnrnqqqgto5z5zu"
      )
    );

    // reload from data blocks
    const mediaNodes = await mediaCollection.load({});

    // check expected media nodes
    expect(mediaNodes).toStrictEqual([mediaNode0, mediaNode1]);

    // check history
    const history: Version[] = mediaCollection.getVersionStore().log();

    expect(history.length).toBe(1);
    expect(history[0].details.tags).toStrictEqual(["test"]);
    expect(history[0].details.comment).toBe("test");
    expect(history[0].details.timestamp).toBeGreaterThan(0);
    expect(history[0].details.timestamp).toBeLessThan(Date.now());
    expect(history[0].parent).toBe(undefined);
    expect(history[0].mergeParent).toBe(undefined);
    expect(history[0].root).toStrictEqual(mediaCollection.currentRoot());
  });

  test("empty media collection api", async () => {
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
    // check empty
    await mediaCollection.load({ startIndex: 0 });
    expect(mediaCollection.valuesLoaded()).toStrictEqual([]);
    // commit
    await mediaCollection.commit({ comment: "test", tags: ["test"] });
    // expect no blocks persisted
    expect(blockStore.size()).toBe(0);
    // check empty
    await mediaCollection.load({ startIndex: 0 });
    expect(mediaCollection.valuesLoaded()).toStrictEqual([]);
    expect(mediaCollection.currentRoot()).toBe(undefined);
    expect(mediaCollection.versionStoreRoot()).toBe(undefined);
  });

  test("media collection export / import", async () => {
    // prepare media collection storage structure
    const blockStore: BlockStore = memoryBlockStoreFactory();
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

    // check empty
    await mediaCollection.load({ startIndex: 0 });

    expect(mediaCollection.valuesLoaded()).toStrictEqual([]);

    // add media
    const mediaNode0: MediaNode = {
      id: "0",
      createdAt: 12345,
      comment: "test",
      media: {
        name: "test",
        mimeType: "text/plain",
        data: new Uint8Array([1, 2, 3, 4, 5]),
      },
    };
    const mediaNode1: MediaNode = {
      id: "1",
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

    // commit
    const { currentRoot: originalVersionRoot } = await mediaCollection.commit({
      comment: "test",
      tags: ["test"],
    });

    // export bundle (current version)
    const bundle: Block = await mediaCollection.exportCurrentVersion();

    // import bundle (current version)
    const importedMediaCollection: MediaCollection =
      await importMediaCollectionVersion(bundle.bytes, {
        chunk,
        chunkSize,
        linkCodec,
        valueCodec,
        blockStore,
      });

    await mediaCollection.load({});
    await importedMediaCollection.load({});

    // check expected content identifier
    expect(
      linkCodec.encodeString(importedMediaCollection.currentRoot())
    ).toStrictEqual(linkCodec.encodeString(mediaCollection.currentRoot()));

    expect(importedMediaCollection.valuesLoaded()).toStrictEqual(
      mediaCollection.valuesLoaded()
    );

    const mediaNode2: MediaNode = {
      id: "2",
      createdAt: 12345,
      comment: "test",
      media: {
        name: "test",
        mimeType: "text/plain",
        data: new Uint8Array([1, 2, 3, 4, 5]),
      },
    };
    mediaCollection.add(mediaNode2);
    await mediaCollection.commit({ comment: "test", tags: ["test"] });

    // export bundle complete
    const bundleComplete: Block = await mediaCollection.exportComplete();

    // import bundle complete
    const importedMediaCollectionComplete: MediaCollection =
      await importMediaCollectionComplete(bundleComplete.bytes, {
        chunk,
        chunkSize,
        linkCodec,
        valueCodec,
        blockStore,
      });

    await importedMediaCollectionComplete.load({});

    // check expected content identifier
    expect(
      linkCodec.encodeString(importedMediaCollectionComplete.currentRoot())
    ).toStrictEqual(linkCodec.encodeString(mediaCollection.currentRoot()));

    // check values
    expect(importedMediaCollectionComplete.valuesLoaded()).toStrictEqual([
      mediaNode0,
      mediaNode1,
      mediaNode2,
    ]);
    const originalVersionStore = mediaCollection.getVersionStore();
    const importedVersionStore =
      importedMediaCollectionComplete.getVersionStore();
    expect(
      linkCodec.encodeString(originalVersionStore.versionStoreRoot())
    ).toStrictEqual(
      linkCodec.encodeString(importedVersionStore.versionStoreRoot())
    );
    expect(originalVersionStore.id()).toStrictEqual(importedVersionStore.id());
    expect(originalVersionStore.log().length).toStrictEqual(
      importedVersionStore.log().length
    );

    // checkout version
    importedMediaCollectionComplete.checkout(originalVersionRoot);

    // check no values loaded after checkout
    expect(importedMediaCollectionComplete.valuesLoaded()).toStrictEqual([]);

    await importedMediaCollectionComplete.load({});

    // check values to reflect original version
    expect(importedMediaCollectionComplete.valuesLoaded()).toStrictEqual([
      mediaNode0,
      mediaNode1,
    ]);
  });
});
