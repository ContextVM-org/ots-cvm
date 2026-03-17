import os
from io import BytesIO

from opentimestamps.calendar import DEFAULT_CALENDAR_WHITELIST, UrlWhitelist
from opentimestamps.core.notary import BitcoinBlockHeaderAttestation, PendingAttestation
from opentimestamps.core.serialize import StreamDeserializationContext
from opentimestamps.core.timestamp import DetachedTimestampFile
from otsclient.cache import TimestampCache
from otsclient.cmds import upgrade_timestamp


def load_detached_timestamp(ots_path: str) -> DetachedTimestampFile:
    with open(ots_path, 'rb') as handle:
        return DetachedTimestampFile.deserialize(StreamDeserializationContext(handle))


def load_payload(target_event_id: str, ots_path: str) -> bytes:
    payload_path = ots_path[:-4] if ots_path.endswith('.ots') else None
    if payload_path and os.path.exists(payload_path):
        with open(payload_path, 'rb') as payload_handle:
            return payload_handle.read()

    return (target_event_id + '\n').encode()


def make_upgrade_args(cache_path: str):
    whitelist = UrlWhitelist()
    whitelist.update(DEFAULT_CALENDAR_WHITELIST)

    class Args:
        pass

    args = Args()
    args.cache = TimestampCache(cache_path)
    args.whitelist = whitelist
    args.calendar_urls = []
    args.wait = False
    args.wait_interval = 30
    return args


def upgrade_detached_timestamp(detached: DetachedTimestampFile, cache_path: str) -> None:
    upgrade_timestamp(detached.timestamp, make_upgrade_args(cache_path))


def summarize_attestations(detached: DetachedTimestampFile) -> dict[str, object]:
    bitcoin_attestations = 0
    pending_attestations = 0
    attestation_heights: list[int] = []

    for _, attestation in detached.timestamp.all_attestations():
        if isinstance(attestation, PendingAttestation):
            pending_attestations += 1
        if isinstance(attestation, BitcoinBlockHeaderAttestation):
            bitcoin_attestations += 1
            attestation_heights.append(attestation.height)

    return {
        'fileHash': f"{detached.file_hash_op.HASHLIB_NAME}:{detached.file_digest.hex()}",
        'bitcoinAttestations': bitcoin_attestations,
        'pendingAttestations': pending_attestations,
        'attestationHeights': sorted(attestation_heights),
    }


def payload_digest_matches(detached: DetachedTimestampFile, payload: bytes) -> bool:
    actual_digest = detached.file_hash_op.hash_fd(BytesIO(payload))
    return actual_digest == detached.file_digest


def find_best_bitcoin_attestation(detached: DetachedTimestampFile):
    selected_msg = None
    selected_attestation = None

    for msg, attestation in detached.timestamp.all_attestations():
        if isinstance(attestation, BitcoinBlockHeaderAttestation):
            if selected_attestation is None or attestation.height < selected_attestation.height:
                selected_attestation = attestation
                selected_msg = msg

    return selected_msg, selected_attestation
