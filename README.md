# Media

Client centric media storage and exchange protocol.

## Media Collection

The media collection is a persisted and versioned list of media entries.

Usage examples:

```ts
const blockStore: BlockStore = memoryBlockStoreFactory();
const linkCodec: LinkCodec = linkCodecFactory();
const valueCodec: ValueCodec = valueCodecFactory();
const versionStore: VersionStore = await versionStoreFactory({
  chunk,
  linkCodec,
  valueCodec,
  blockStore,
});
const graphStore = graphStore({
  chunk,
  linkCodec,
  valueCodec,
  blockStore,
});
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
const { currentRoot, versionStoreId, versionStoreRoot } =
  await mediaCollection.commit({ comment: "test", tags: ["test"] });

// export current version
const bundle: Block = await mediaCollection.exportCurrentVersion();

// or share it via a relay
const response: BasicPushResponse = await mediaCollection.push(
  "http://localhost:3002"
);

// elsewhere: pull the media collection
const blockStoreElsewhere: BlockStore = memoryBlockStoreFactory();
const mediaCollectionElsewhere: MediaCollection = await pullMediaCollection(
  "http://localhost:3002",
  versionStoreId,
  {
    chunk,
    chunkSize,
    linkCodec,
    valueCodec,
    blockStore: blockStoreElsewhere,
  }
);

// collaborate on it
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

// share the changes
const response2: BasicPushResponse = await mediaCollectionElsewhere.push(
  "http://localhost:3002"
);
```

[Media relay](./src/__tests__/media-relay.test.ts) and [media collection](./src/__tests__/media-collection.test.ts) tests provide more usage examples.

## Media System

The media system associates logical names (or paths) to media collections. A media system is a persisted data structure sharing the general attributes of the media collection. A simple metaphor: if a media collection could be loosely conceptualized as a versioned file, the media system could be seen as the versioned file system containing the files.

```ts
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
// create a named collection
const namedMediaCollection: NamedMediaCollection = {
  name: "/tmp",
  ...mediaCollection,
};
// add named collection to media system
mediaSystem.add(namedMediaCollection);

// commit media system
await mediaSystem.commitCollection({ collectionName: "/tmp" });
```

[Media system tests](./src/__tests__/media-system.test.ts) provide more usage examples.

## Content Addressable

Both media collections and media systems are content addressable. Complete functionality described at [@ubiquify/core](https://github.com/ubiquify/core):

- local-first
- distributed
- conflict-free
- immutable
- versioned
- trustless
- secure

## Build

```sh
npm run clean
npm install
npm run build
npm run test
```

## Licenses

Licensed under either [Apache 2.0](http://opensource.org/licenses/MIT) or [MIT](http://opensource.org/licenses/MIT) at your option.
