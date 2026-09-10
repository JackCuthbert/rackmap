# Layered Workload Model Design

## Purpose

Replace the original logical-network and compute-container model with a map
that reflects physical placement and service workloads without duplicating
appliance VMs.

## Model

The map has five fixed top-down bands: Locations, Network, Hardware,
Virtualisation, and Applications. Locations contain rooms/racks. Network
contains internet sources and network equipment. Hardware contains physical
compute, storage, and power equipment. Virtualisation contains VMs placed on
physical compute hardware. Applications contains explicit service/container
workloads plus browser-derived appliance workloads.

A VM has optional `application` metadata. When supplied, it derives one
read-only application node with an internal ID based on the VM ID. The derived
node is not YAML data and points to its VM. Explicit applications may also run
on that VM. This represents a Plex appliance VM once while allowing a Docker
VM to host multiple declared services.

## Networking and VLANs

Network links remain peer connections between interfaces. Logical network and
VLAN entities are removed. Physical interfaces and VM virtual NICs can carry
`nativeVlan` and `taggedVlans` metadata. The browser assigns deterministic,
accessible VLAN colours to interface/node badges; untagged interfaces retain a
neutral appearance. VLANs are not graph nodes. Future filtering may use the
same metadata.

## Selection

The inspector continues to show direct relationships. Visual selection follows
the complete upstream directed containment/placement chain, so an application
highlights its VM, backing hardware, and containing locations. Unrelated graph
items are dimmed. Peer network links remain direct-only.

## Validation

VMs must reference hardware with compute capability. Applications must
reference VMs. Appliance metadata is structurally valid URL/common metadata;
the derived application receives the VM as its deployment target. Location
cycles remain prohibited. VLAN IDs must be integers 1–4094, and tagged VLANs
cannot repeat or include the native VLAN.
