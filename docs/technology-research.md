# Technology research for the asset library

Research date: 2026-10-05. Scope: architecture review for a standalone web asset catalog. Ticket workflows, facility management, and placement into a digital twin are outside this review. No application implementation was performed.

User-confirmed initial scope: IFC models first, with users able to upload and manage assets.

## That Open: distinguish libraries from the hosted platform

That Open Company currently distinguishes **Fragments** (an open BIM data format), **That Open Engine** (open-source viewer and tools), and **That Open Platform** (an optional operational layer for developing, deploying, and running applications). Its self-hosted product guidance points development teams to Fragments and Engine. Calling the open-source packages “That Open Platform backend” would obscure that distinction. [Official product overview](https://thatopen.com/bim-software-open-source/)

The components repository describes `@thatopen/components` as a BIM toolkit built on Fragments and Three.js. Core supports renderer-independent and headless/server workflows; `@thatopen/components-front` supplies renderer-dependent features. These packages supply BIM capabilities rather than a complete catalog backend with application accounts, inventory records, and publishing workflows. The last sentence is an architectural inference from the documented package responsibilities. [Official repository guide](https://github.com/ThatOpen/engine_components/blob/main/CONTRIBUTING.md)

Fragments provides an IFC importer usable in both frontend and backend contexts. The company describes the commercial Platform as providing enterprise operations including authentication/SSO, access control, pipelines, monitoring, and SLAs. These are product descriptions, not proof that a particular public API or deployment contract is available to this project. [Official Fragments repository](https://github.com/ThatOpen/engine_fragment), [official Fragments product page](https://thatopen.com/bim-software-open-source/fragments/)

**Recommendation:** use Engine/Fragments selectively for supported BIM previews and ingestion. Give the catalog its own application API and metadata model unless a verified Platform contract supplies those responsibilities. Confirm whether “That Open Platform” means the commercial offering or the open-source libraries before choosing deployment and authentication infrastructure.

For the confirmed IFC-first scope, retain the original IFC and generate a Fragments representation for browser previews. Perform conversion as a tracked processing job so failed conversion does not masquerade as a ready preview. This is an architecture recommendation based on the documented IFC importer, not a requirement of Fragments. Keep the catalog revision relationship explicit between original IFC, derived preview data, and thumbnail. [Official Fragments repository](https://github.com/ThatOpen/engine_fragment)

## Nucleus: useful asset infrastructure, not an assumed catalog schema

NVIDIA calls Nucleus a database and collaboration engine. Its documented responsibilities include a logical file tree, HTTP/WebSocket APIs, large-file transfers, and utility services for search indexing, thumbnails for supported formats, and file tags. It therefore offers more than simple blob storage. Its physical data directory is not the logical file tree. [Official Nucleus architecture](https://docs.omniverse.nvidia.com/nucleus/latest/architecture.html)

**Architectural inference:** treat Nucleus as the repository for asset files and Omniverse dependencies, while a catalog database owns business identity, taxonomy, variants, revision relationships, publication state, and format representations. Nucleus search and tags may complement catalog discovery; their presence does not establish a relational catalog domain model or the required governance workflow.

NVIDIA's separate USD Search API indexes storage backends including Nucleus, S3-compatible storage, Google Cloud, and Azure Blob. It uses search/embedding/indexing/rendering services and separate OpenSearch and Neo4j stores. This demonstrates that an advanced discovery index can be separated from file storage; adding these services is optional and should follow a demonstrated search need. [Official USD Search architecture](https://docs.omniverse.nvidia.com/services/latest/services/usd-search/architecture.html)

## Web access, identity, and authorization

Nucleus supports browser access through Nucleus Navigator, and its core API uses HTTP and WebSockets. The published Client Library supplies file operations and authentication; its documented Python API includes file reads and ACL retrieval. These facts do not by themselves establish a supported JavaScript SDK or a drop-in browser integration for this custom application. [Nucleus architecture](https://docs.omniverse.nvidia.com/nucleus/latest/architecture.html), [Client Library](https://docs.omniverse.nvidia.com/kit/docs/client_library/latest/index.html), [Python API](https://docs.omniverse.nvidia.com/kit/docs/client_library/latest/docs/python.html)

Enterprise Nucleus supports SAML identity providers through its authentication service and SSO gateway. It issues its own internal JWT after authentication. A catalog web session or its identity-provider token must not be assumed to work directly as a Nucleus token. [Official SAML SSO documentation](https://docs.omniverse.nvidia.com/nucleus/latest/enterprise/installation/sso.html)

Nucleus permissions apply to files and folders with no-access, read, write, and admin levels. Read access includes directory visibility, downloading, and checkpoint access. Permission inheritance and the most permissive union of applicable grants require explicit mapping rather than a guessed deny-first rule. [Official ACL documentation](https://docs.omniverse.nvidia.com/nucleus/latest/config-and-info/acls.html?highlight=acl)

API tokens support automated clients; they are credentials and should stay in the service environment. **Recommendation/inference:** place a storage adapter behind the catalog API, authorize each operation, and decide explicitly between per-user Nucleus access and a restricted service account. If a service account reads files, the catalog API must enforce application authorization for downloads and previews; merely checking the service account's ACL does not authorize the end user. [Official API token documentation](https://docs.omniverse.nvidia.com/nucleus/latest/config-and-info/api_tokens.html)

User uploads and asset management make write authorization part of the initial scope. The storage adapter must distinguish adding/replacing content from deleting, renaming, moving, and changing permissions: Nucleus write and admin ACLs are different capabilities. **Recommendation:** catalog-level management roles should map to specific allowed storage operations; do not grant every uploader Nucleus administrator access. [Official ACL documentation](https://docs.omniverse.nvidia.com/nucleus/latest/config-and-info/acls.html?highlight=acl)

Nucleus TLS termination uses NVIDIA's ingress router; the server's internal endpoints are HTTP/WebSocket. NVIDIA says external proxies are unsupported and routing is validated against its ingress router. The proposed application adapter is a client using supported APIs, not an instruction to replace that ingress router with a generic proxy. [Official TLS configuration](https://docs.omniverse.nvidia.com/nucleus/latest/enterprise/installation/tls.html)

## Lifecycle and deployment constraints

Omniverse Launcher and Nucleus Workstation were deprecated on **2025-10-01**. Existing Workstation installations can continue functioning, but NVIDIA says the Workstation package is no longer available for reinstallation. A new production architecture should not depend on deploying Workstation. [Official legacy tools and migration FAQ](https://developer.nvidia.com/omniverse/legacy-tools)

Enterprise Nucleus remains available from NGC using a free NVIDIA Developer Account. NVIDIA describes it as free for testing/development, with an Enterprise license required for production use and Enterprise support. Confirm entitlement and terms for the intended deployment before implementation. [Official Enterprise overview](https://docs.omniverse.nvidia.com/nucleus/latest/enterprise.html), [official migration FAQ](https://developer.nvidia.com/omniverse/legacy-tools)

Enterprise deployment requires planned server operations, backups, networking, and identity integration. NVIDIA does not support remotely mounted SMB/CIFS, NFS, or iSCSI storage for its transactional files/databases. Nucleus does not itself encrypt stored data; environment-level encryption is required when encryption at rest is needed. [Official installation planning](https://docs.omniverse.nvidia.com/nucleus/latest/enterprise/installation/planning.html)

## Unresolved before implementation

- Actual Enterprise Nucleus availability, version, license entitlement, network accessibility, and IT owner for this project.
- Whether commercial That Open Platform is intended, and its actual API, hosting, tenant, SSO, and extension contracts. Public product positioning is insufficient to select it as the catalog backend.
- Supported custom-client authentication flow, browser/CORS behavior if direct browser access is considered, and the service-account versus delegated-user authorization design.
- IFC upload size and scale, IFC schema versions, conversion execution environment, and preview expectations. IFC is the initial source format; BIM Engine/Fragments capabilities should not be generalized to native Revit families, all CAD formats, or USD without a demonstrated ingestion/rendering pipeline.
- Required catalog fields, taxonomy, version semantics, publication permissions, file dependency packaging, and change synchronization with Nucleus.

The repository can remain storage-independent at the domain boundary: asset and revision identities belong to the catalog; storage references identify where each representation resides. Nucleus can be the first storage provider without making its folder path the permanent business identity. This is a proposed architecture, not a vendor guarantee.
