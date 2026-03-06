// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

contract VoxVoting is Ownable {
    error InvalidPollWindow();
    error InvalidOptionCount();
    error EmptyQuestion();
    error EmptyOption();
    error PollNotFound();
    error PollNotActive();
    error AlreadyVoted();
    error InvalidOption();

    struct Poll {
        string question;
        uint64 startsAt;
        uint64 endsAt;
        uint32 totalVotes;
        address creator;
        string[] options;
        uint32[] voteCounts;
    }

    uint256 public pollCount;

    mapping(uint256 pollId => Poll poll) private polls;
    mapping(uint256 pollId => mapping(address voter => bool voted)) public hasVoted;

    event PollCreated(
        uint256 indexed pollId,
        string question,
        uint64 startsAt,
        uint64 endsAt,
        address indexed creator
    );

    event VoteCast(uint256 indexed pollId, address indexed voter, uint256 indexed optionId);

    constructor(address initialOwner) Ownable(initialOwner) {}

    function createPoll(
        string calldata question,
        string[] calldata options,
        uint64 startsAt,
        uint64 endsAt
    ) external onlyOwner returns (uint256 pollId) {
        if (bytes(question).length == 0) revert EmptyQuestion();
        if (options.length < 2) revert InvalidOptionCount();
        if (startsAt >= endsAt) revert InvalidPollWindow();

        pollId = pollCount;
        pollCount += 1;

        Poll storage poll = polls[pollId];
        poll.question = question;
        poll.startsAt = startsAt;
        poll.endsAt = endsAt;
        poll.creator = msg.sender;

        for (uint256 i = 0; i < options.length; i++) {
            if (bytes(options[i]).length == 0) revert EmptyOption();
            poll.options.push(options[i]);
            poll.voteCounts.push(0);
        }

        emit PollCreated(pollId, question, startsAt, endsAt, msg.sender);
    }

    function vote(uint256 pollId, uint256 optionId) external {
        Poll storage poll = polls[pollId];

        if (bytes(poll.question).length == 0) revert PollNotFound();
        if (block.timestamp < poll.startsAt || block.timestamp > poll.endsAt) revert PollNotActive();
        if (hasVoted[pollId][msg.sender]) revert AlreadyVoted();
        if (optionId >= poll.options.length) revert InvalidOption();

        hasVoted[pollId][msg.sender] = true;
        poll.voteCounts[optionId] += 1;
        poll.totalVotes += 1;

        emit VoteCast(pollId, msg.sender, optionId);
    }

    function getPoll(
        uint256 pollId
    )
        external
        view
        returns (
            string memory question,
            uint64 startsAt,
            uint64 endsAt,
            uint32 totalVotes,
            address creator,
            string[] memory options,
            uint32[] memory voteCounts,
            bool isActive
        )
    {
        Poll storage poll = polls[pollId];
        if (bytes(poll.question).length == 0) revert PollNotFound();

        return (
            poll.question,
            poll.startsAt,
            poll.endsAt,
            poll.totalVotes,
            poll.creator,
            poll.options,
            poll.voteCounts,
            block.timestamp >= poll.startsAt && block.timestamp <= poll.endsAt
        );
    }
}
