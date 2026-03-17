import json
import sys
import urllib.request
from io import BytesIO

from bitcoin.core import CBlockHeader
from proof_common import (
    find_best_bitcoin_attestation,
    load_detached_timestamp,
    load_payload,
    payload_digest_matches,
    summarize_attestations,
    upgrade_detached_timestamp,
)


def main() -> None:
    target_event_id, ots_path, api_url, cache_path = sys.argv[1:5]

    payload = load_payload(target_event_id, ots_path)
    detached = load_detached_timestamp(ots_path)
    upgrade_detached_timestamp(detached, cache_path)

    digest_matches = payload_digest_matches(detached, payload)
    if not digest_matches:
        raise RuntimeError('Target payload does not match detached timestamp digest')

    summary = summarize_attestations(detached)
    selected_msg, selected_attestation = find_best_bitcoin_attestation(detached)

    if selected_attestation is None or selected_msg is None:
        print(json.dumps({
            **summary,
            'digestMatches': digest_matches,
            'bitcoinVerified': False,
            'verificationMode': 'public-bitcoin-api',
            'provider': api_url,
            'blockHeight': None,
            'blockHash': None,
            'attestedTime': None,
            'hasPendingAttestations': summary['pendingAttestations'] > 0,
            'isPending': summary['pendingAttestations'] > 0,
            'message': 'Proof does not yet contain a Bitcoin attestation. Pending calendar attestations remain and may still upgrade to Bitcoin attestations later.',
        }, separators=(',', ':')))
        return

    opener = urllib.request.build_opener()
    opener.addheaders = [('Content-Type', 'application/json'), ('User-Agent', 'ots-cvm/1.0')]

    def rpc(method: str, params: list[object]) -> object:
        request = urllib.request.Request(
            api_url,
            data=json.dumps({
                'jsonrpc': '1.0',
                'id': 'ots-cvm',
                'method': method,
                'params': params,
            }).encode(),
            method='POST',
        )
        with opener.open(request, timeout=20) as response:
            body = json.loads(response.read().decode())
            if body.get('error') is not None:
                raise RuntimeError(str(body['error']))
            return body['result']

    block_hash = rpc('getblockhash', [selected_attestation.height])
    block_header_hex = rpc('getblockheader', [block_hash, False])
    block_header = CBlockHeader.stream_deserialize(BytesIO(bytes.fromhex(block_header_hex)))
    attested_time = selected_attestation.verify_against_blockheader(selected_msg, block_header)

    print(json.dumps({
        **summary,
        'digestMatches': digest_matches,
        'bitcoinVerified': True,
        'verificationMode': 'public-bitcoin-api',
        'provider': api_url,
        'blockHeight': selected_attestation.height,
        'blockHash': block_hash,
        'attestedTime': attested_time,
        'hasPendingAttestations': summary['pendingAttestations'] > 0,
        'isPending': False,
        'message': 'Bitcoin attestation verified against public API. Pending calendar attestations may still remain on other proof branches.',
    }, separators=(',', ':')))


if __name__ == '__main__':
    main()
