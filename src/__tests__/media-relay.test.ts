import {
  BlockStore,
  Link,
  LinkCodec,
  MemoryBlockStore,
  Signer,
  ValueCodec,
  VersionStore,
  chunkerFactory,
  graphStoreFactory,
  linkCodecFactory,
  memoryBlockStoreFactory,
  signerFactory,
  valueCodecFactory,
  versionStoreFactory,
} from "@ubiquify/core";
import {
  GraphRelay,
  LinkResolver,
  createGraphRelay,
  memoryBlockResolverFactory,
} from "@ubiquify/relay";
import { compute_chunks } from "@dstanesc/wasm-chunking-fastcdc-node";
import { fileName, readResource, writeTempResource } from "./util";
import {
  CHUNK_SIZE_DEFAULT,
  MediaCollection,
  MediaNode,
  MediaSystem,
  NamedMediaCollection,
  mediaCollectionFactory,
  mediaSystemFactory,
  pullMediaCollection,
} from "../index";
import crypto from "crypto";
import {
  RelayClientBasic,
  relayClientBasicFactory,
  BasicPushResponse,
} from "@ubiquify/cyclone";

const { subtle } = crypto.webcrypto;
const chunkSize = CHUNK_SIZE_DEFAULT;
const { chunk } = chunkerFactory(chunkSize, compute_chunks);
const linkCodec: LinkCodec = linkCodecFactory();
const valueCodec: ValueCodec = valueCodecFactory();

describe("Basic client tests", () => {
  let relayBlockStore: BlockStore;
  let blockStore: MemoryBlockStore;
  let linkResolver: LinkResolver;
  let server: any;
  let graphRelay: GraphRelay;
  let relayClient: RelayClientBasic;
  beforeAll((done) => {
    blockStore = memoryBlockStoreFactory();
    relayBlockStore = memoryBlockStoreFactory();
    linkResolver = memoryBlockResolverFactory();
    graphRelay = createGraphRelay(relayBlockStore, linkResolver);
    server = graphRelay.startHttp(3000, done); // Start the server
    relayClient = relayClientBasicFactory(
      {
        chunk,
        chunkSize,
        linkCodec,
        valueCodec,
        blockStore,
        maxBatchSizeBytes: 1024 * 256,
      },
      {
        baseURL: "http://localhost:3000",
      }
    );
  });

  afterAll((done) => {
    graphRelay.stopHttp(done); // Stop the server
  });

  describe("media collection sharing", () => {
    let olderVersionRoot: Link;
    let versionStoreRootShared: Link;
    let blockStoreShared: BlockStore;

    it("should create, sign, push, pull, verify authenticity, load", async () => {
      const blockStore: BlockStore = memoryBlockStoreFactory();

      // prepare media system storage structures
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
      const initialMediaSystem: MediaSystem = mediaSystemFactory(
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

      // prepare media collection storage structure
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

      const videoData: Uint8Array = new Uint8Array(1024 * 1024 * 24);
      const pdfData: Uint8Array = new Uint8Array(1024 * 256);
      const imageData: Uint8Array = new Uint8Array(1024 * 1024);

      const mediaNode0: MediaNode = {
        id: "abc",
        createdAt: 12345,
        comment: "This is a video",
        media: {
          name: "example",
          mimeType: "video/mp4",
          data: videoData,
        },
      };
      const mediaNode1: MediaNode = {
        id: "def",
        createdAt: 12345,
        comment: "This is a pdf document",
        media: {
          name: "example",
          mimeType: "application/pdf",
          data: pdfData,
        },
      };
      const mediaNode2: MediaNode = {
        id: "ghi",
        createdAt: 12345,
        comment: "This is a png image",
        media: {
          name: "example",
          mimeType: "image/png",
          data: imageData,
        },
      };
      mediaCollection.add(mediaNode0);
      mediaCollection.add(mediaNode1);
      mediaCollection.add(mediaNode2);

      // sign the media collection (optional)
      const { publicKey, privateKey } = await subtle.generateKey(
        {
          name: "RSA-PSS",
          modulusLength: 2048,
          publicExponent: new Uint8Array([1, 0, 1]),
          hash: "SHA-256",
        },
        true,
        ["sign", "verify"]
      );
      const signer: Signer = signerFactory({ subtle, privateKey, publicKey });

      // commit the media collection & sign it
      const { versionStoreId, versionStoreRoot, currentRoot } =
        await mediaCollection.commit({
          comment: "First test",
          tags: ["v0.0.1"],
          signer,
        });

      olderVersionRoot = currentRoot;

      // create a named collection
      const namedMediaCollection: NamedMediaCollection = {
        name: "/tmp",
        ...mediaCollection,
      };

      // add named collection to media system
      initialMediaSystem.add(namedMediaCollection);
      // commit media system
      await initialMediaSystem.commit({});

      // share the media collection
      const response: BasicPushResponse = await mediaCollection.push(
        "http://localhost:3000"
      );

      // load media system - full load
      await initialMediaSystem.load({});

      // exercise the remote update check
      const shouldBeNone =
        await initialMediaSystem.areRemoteUpdatesForLoadedCollection({
          name: "/tmp",
          relayUrl: "http://localhost:3000",
        });

      expect(shouldBeNone).toBe(false);

      // pull the media collection elsewhere
      const blockStore2: BlockStore = memoryBlockStoreFactory();
      const mediaCollectionPulled: MediaCollection = await pullMediaCollection(
        "http://localhost:3000",
        versionStoreId,
        {
          chunk,
          chunkSize,
          linkCodec,
          valueCodec,
          blockStore: blockStore2,
        }
      );

      const trustIt = await mediaCollectionPulled.verify({
        subtle,
        publicKey,
      });

      expect(trustIt).toBe(true);

      // load all values
      const mediaNodesPulled: MediaNode[] = await mediaCollectionPulled.load(
        {}
      );

      expect(mediaNodesPulled.length).toBe(3);
      // check the first media node
      expect(mediaNodesPulled[0].id).toBe(mediaNode0.id);
      expect(mediaNodesPulled[0].comment).toBe(mediaNode0.comment);
      expect(mediaNodesPulled[0].media.mimeType).toBe(
        mediaNode0.media.mimeType
      );
      expect(mediaNodesPulled[0].media.data.byteLength).toEqual(
        mediaNode0.media.data.byteLength
      );
      // check the second media node
      expect(mediaNodesPulled[1].id).toBe(mediaNode1.id);
      expect(mediaNodesPulled[1].comment).toBe(mediaNode1.comment);
      expect(mediaNodesPulled[1].media.mimeType).toBe(
        mediaNode1.media.mimeType
      );
      expect(mediaNodesPulled[1].media.data.byteLength).toEqual(
        mediaNode1.media.data.byteLength
      );
      // check the third media node
      expect(mediaNodesPulled[2].id).toBe(mediaNode2.id);
      expect(mediaNodesPulled[2].comment).toBe(mediaNode2.comment);
      expect(mediaNodesPulled[2].media.mimeType).toBe(
        mediaNode2.media.mimeType
      );
      expect(mediaNodesPulled[2].media.data.byteLength).toEqual(
        mediaNode2.media.data.byteLength
      );

      // add a new media node
      const mediaNode3: MediaNode = {
        id: "xyz",
        createdAt: 12345,
        comment: "This is a video",
        media: {
          name: "example",
          mimeType: "video/mp4",
          data: videoData,
        },
      };

      // pull the media collection elsewhere
      const blockStoreElsewhere: BlockStore = memoryBlockStoreFactory();
      const mediaCollectionElsewhere: MediaCollection =
        await pullMediaCollection("http://localhost:3000", versionStoreId, {
          chunk,
          chunkSize,
          linkCodec,
          valueCodec,
          blockStore: blockStoreElsewhere,
        });
      // edit it elsewhere
      mediaCollectionElsewhere.add(mediaNode3);

      // commit the media collection & sign it
      const {
        versionStoreId: versionStoreId2,
        versionStoreRoot: versionStoreRoot2,
        currentRoot: currentRoot2,
      } = await mediaCollectionElsewhere.commit({
        comment: "Second test",
        tags: ["v0.0.2"],
        signer,
      });

      // share the media collection, mediaNode3 should be added to the media collection
      const response2: BasicPushResponse = await mediaCollectionElsewhere.push(
        "http://localhost:3000"
      );

      // exercise the remote update check again for the initial media collection
      await initialMediaSystem.load({}); // make sure up-to-date
      const shouldFindUpdates =
        await initialMediaSystem.areRemoteUpdatesForLoadedCollection({
          name: "/tmp",
          relayUrl: "http://localhost:3000",
        });

      expect(shouldFindUpdates).toBe(true);

      // pull the media collection somewhere
      const blockStore3: BlockStore = memoryBlockStoreFactory();
      const mediaCollectionPulled2: MediaCollection = await pullMediaCollection(
        "http://localhost:3000",
        versionStoreId2,
        {
          chunk,
          chunkSize,
          linkCodec,
          valueCodec,
          blockStore: blockStore3,
        }
      );

      versionStoreRootShared = mediaCollectionPulled2.versionStoreRoot();
      blockStoreShared = blockStore3;

      const trustIt2 = await mediaCollectionPulled2.verify({
        subtle,
        publicKey,
      });

      expect(trustIt2).toBe(true);

      // load all values
      const mediaNodesPulled2: MediaNode[] = await mediaCollectionPulled2.load(
        {}
      );

      expect(mediaNodesPulled2.length).toBe(4);
      // check the first media node
      expect(mediaNodesPulled2[0].id).toBe(mediaNode0.id);
      expect(mediaNodesPulled2[0].comment).toBe(mediaNode0.comment);
      expect(mediaNodesPulled2[0].media.mimeType).toBe(
        mediaNode0.media.mimeType
      );
      expect(mediaNodesPulled2[0].media.data.byteLength).toEqual(
        mediaNode0.media.data.byteLength
      );
      // check the second media node
      expect(mediaNodesPulled2[1].id).toBe(mediaNode1.id);
      expect(mediaNodesPulled2[1].comment).toBe(mediaNode1.comment);
      expect(mediaNodesPulled2[1].media.mimeType).toBe(
        mediaNode1.media.mimeType
      );
      expect(mediaNodesPulled2[1].media.data.byteLength).toEqual(
        mediaNode1.media.data.byteLength
      );
      // check the third media node
      expect(mediaNodesPulled2[2].id).toBe(mediaNode2.id);
      expect(mediaNodesPulled2[2].comment).toBe(mediaNode2.comment);
      expect(mediaNodesPulled2[2].media.mimeType).toBe(
        mediaNode2.media.mimeType
      );
      expect(mediaNodesPulled2[2].media.data.byteLength).toEqual(
        mediaNode2.media.data.byteLength
      );
      // check the fourth media node
      expect(mediaNodesPulled2[3].id).toBe(mediaNode3.id);
      expect(mediaNodesPulled2[3].comment).toBe(mediaNode3.comment);
      expect(mediaNodesPulled2[3].media.mimeType).toBe(
        mediaNode3.media.mimeType
      );
      expect(mediaNodesPulled2[3].media.data.byteLength).toEqual(
        mediaNode3.media.data.byteLength
      );
      // write the media files to the temp directory
      mediaNodesPulled2.forEach((mediaNode) => {
        writeTempResource(fileName(mediaNode.media), mediaNode.media.data);
      });

      // pull from within the original media collection
      expect(mediaCollection.persistedSize()).resolves.toBe(3);
      await mediaCollection.pull("http://localhost:3000");
      expect(mediaCollection.persistedSize()).resolves.toBe(4);
      const mediaNodesPulled3 = await mediaCollection.load({});
      // check the fourth media node merged
      expect(mediaNodesPulled3[3].id).toBe(mediaNode3.id);
      expect(mediaNodesPulled3[3].comment).toBe(mediaNode3.comment);
      expect(mediaNodesPulled3[3].media.mimeType).toBe(
        mediaNode3.media.mimeType
      );
      expect(mediaNodesPulled3[3].media.data.byteLength).toEqual(
        mediaNode3.media.data.byteLength
      );
    });

    it("should reload collection from versionStoreRoot, demonstrate time travel", async () => {
      //specify the store root to load
      const versionStore: VersionStore = await versionStoreFactory({
        storeRoot: versionStoreRootShared,
        chunk,
        linkCodec,
        valueCodec,
        blockStore: blockStoreShared,
      });
      const graphStore = graphStoreFactory({
        chunk,
        linkCodec,
        valueCodec,
        blockStore: blockStoreShared,
      });
      // instantiate existing media collection
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
      // load all values
      const mediaNodes: MediaNode[] = await mediaCollection.load({});
      // check size
      expect(mediaNodes.length).toBe(4);
      // check the first media node
      expect(mediaNodes[0].id).toBe("abc");
      // check last media node
      expect(mediaNodes[3].id).toBe("xyz");

      // check older collection versions
      versionStore.checkout(olderVersionRoot);
      // load all values
      const mediaNodesFirst: MediaNode[] = await mediaCollection.load({});
      // check size
      expect(mediaNodesFirst.length).toBe(3);
      // check last media node
      expect(mediaNodes[2].id).toBe("ghi");
    });
  });
});
