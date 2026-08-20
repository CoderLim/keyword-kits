import pytest

from rotating_request import QingGuoRotator, RotatingSession


BASE_PROXY = "http://alice:secret:channel-default:60@proxy.example:1234"


class RequestBlocked(Exception):
    pass


class UnrelatedError(Exception):
    pass


def make_session(**kwargs):
    sleeps = []
    session = RotatingSession(
        proxy=BASE_PROXY,
        rotator=QingGuoRotator(tag_factory=lambda context: f"retry-{context.attempt}"),
        sleeper=sleeps.append,
        **kwargs,
    )
    return session, sleeps


def test_run_rotates_after_selected_exception_and_repeats_operation():
    session, sleeps = make_session()
    seen_proxies = []

    def operation():
        seen_proxies.append(session.current_proxy)
        if len(seen_proxies) == 1:
            raise RequestBlocked("blocked")
        return "transcript"

    result = session.run(operation, rotate_on=(RequestBlocked,))

    assert result == "transcript"
    assert sleeps == [2.0]
    assert seen_proxies == [
        BASE_PROXY,
        "http://alice:secret:channel-retry-1-default:60@proxy.example:1234",
    ]


def test_run_does_not_catch_unselected_exception():
    session, sleeps = make_session()

    with pytest.raises(UnrelatedError, match="bug"):
        session.run(lambda: (_ for _ in ()).throw(UnrelatedError("bug")), rotate_on=(RequestBlocked,))

    assert sleeps == []


def test_run_accepts_exception_predicate():
    session, _sleeps = make_session()
    attempts = 0

    def operation():
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            raise RuntimeError("IP blocked")
        return "ok"

    result = session.run(operation, rotate_on=lambda error: "blocked" in str(error))

    assert result == "ok"
    assert attempts == 2


def test_run_reraises_selected_exception_when_attempts_are_exhausted():
    session, sleeps = make_session()

    with pytest.raises(RequestBlocked, match="still blocked"):
        session.run(
            lambda: (_ for _ in ()).throw(RequestBlocked("still blocked")),
            rotate_on=(RequestBlocked,),
            max_attempts=3,
        )

    assert sleeps == [2.0, 4.0]


def test_run_without_proxy_reraises_without_retrying():
    calls = 0
    session = RotatingSession(sleeper=lambda _delay: None)

    def operation():
        nonlocal calls
        calls += 1
        raise RequestBlocked("blocked")

    with pytest.raises(RequestBlocked):
        session.run(operation, rotate_on=(RequestBlocked,))

    assert calls == 1
