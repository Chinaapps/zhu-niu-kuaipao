#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Liquid Glass 数学计算引擎 (Python 版)

纯计算器 —— 不含任何单位换算。任意精度、任意大数，等待即可完成，不会计算超时。

设计要点：
  1. 整数 / 分数：用 Python 原生 int（无限精度）实现精确有理数 BigRat，
     四则运算、乘方(整数指数)、取模、整数除法全部精确，可算任意大数。
  2. 超越函数（sin/cos/tan/ln/exp/开方等）：基于 decimal 模块，可配置高精度，
     泰勒级数 + 自变量约化，逐项收敛；常数 pi/e/ln2 也由级数按需生成。
  3. 表达式解析：递归下降解析器，全程使用 BigRat / Decimal，不做 float 转换。

本文件既是引擎库，也可作为命令行 REPL 直接运行：
    python3 calculator.py
"""

from __future__ import annotations

import sys
from decimal import Decimal, getcontext, localcontext
import re

# 允许任意大的整数 <-> 字符串转换（默认上限 4300 位）
try:
    sys.set_int_max_str_digits(0)
except AttributeError:
    pass

# ---------------------------------------------------------------------------
# 全局精度控制
# ---------------------------------------------------------------------------
DEFAULT_PREC = 50                      # 最终结果保留的小数位数（可调大）
getcontext().prec = DEFAULT_PREC + 30  # 内部多留，避免舍入误差


def set_precision(digits: int) -> None:
    global DEFAULT_PREC
    digits = max(15, int(digits))
    DEFAULT_PREC = digits
    getcontext().prec = digits + 30


# ---------------------------------------------------------------------------
# 精确有理数  BigRat
# ---------------------------------------------------------------------------
def _igcd(a: int, b: int) -> int:
    a, b = abs(a), abs(b)
    while b:
        a, b = b, a % b
    return a or 1


class BigRat:
    """精确有理数：numerator / denominator（Python int，无限精度）。"""

    __slots__ = ("n", "d")

    def __init__(self, n=0, d=1):
        if isinstance(n, BigRat):
            self.n, self.d = n.n, n.d
        elif isinstance(n, Decimal):
            self.n, self.d = BigRat._from_decimal(n)
        elif isinstance(n, str):
            self.n, self.d = BigRat._from_decimal(Decimal(n))
        elif isinstance(n, float):
            self.n, self.d = BigRat._from_decimal(Decimal(repr(n)))
        else:
            self.n, self.d = int(n), int(d)
        self._norm()

    @staticmethod
    def _from_decimal(d: Decimal):
        sign, digits, exp = d.as_tuple()
        num = int("".join(map(str, digits))) or 0
        if sign:
            num = -num
        if exp >= 0:
            num *= 10 ** exp
            den = 1
        else:
            den = 10 ** (-exp)
        return num, den

    def _norm(self):
        if self.d == 0:
            raise ZeroDivisionError("分母为零")
        if self.d < 0:
            self.n, self.d = -self.n, -self.d
        if self.n == 0:
            self.d = 1
        else:
            g = _igcd(self.n, self.d)
            self.n //= g
            self.d //= g

    def __add__(self, o):
        o = o if isinstance(o, BigRat) else BigRat(o)
        return BigRat(self.n * o.d + o.n * self.d, self.d * o.d)

    __radd__ = __add__

    def __sub__(self, o):
        o = o if isinstance(o, BigRat) else BigRat(o)
        return BigRat(self.n * o.d - o.n * self.d, self.d * o.d)

    def __rsub__(self, o):
        return BigRat(o) - self

    def __mul__(self, o):
        o = o if isinstance(o, BigRat) else BigRat(o)
        return BigRat(self.n * o.n, self.d * o.d)

    __rmul__ = __mul__

    def __truediv__(self, o):
        o = o if isinstance(o, BigRat) else BigRat(o)
        if o.n == 0:
            raise ZeroDivisionError("除以零")
        return BigRat(self.n * o.d, self.d * o.n)

    def __rtruediv__(self, o):
        return BigRat(o) / self

    def __neg__(self):
        return BigRat(-self.n, self.d)

    def __abs__(self):
        return BigRat(abs(self.n), self.d)

    def __pow__(self, k):
        if isinstance(k, BigRat) and k.d == 1:
            k = k.n
        if isinstance(k, int):
            if k >= 0:
                return BigRat(self.n ** k, self.d ** k)
            if self.n == 0:
                raise ZeroDivisionError("零的负次幂")
            return BigRat(self.d ** (-k), self.n ** (-k))
        with localcontext() as ctx:
            ctx.prec = getcontext().prec + 10
            base = Decimal(self.n) / Decimal(self.d)
            if self.n < 0:
                raise ValueError("负数的非整数次幂未定义")
            expo = Decimal(k.n) / Decimal(k.d) if isinstance(k, BigRat) else Decimal(str(k))
            return BigRat(base ** expo)

    def floordiv(self, o) -> "BigRat":
        o = o if isinstance(o, BigRat) else BigRat(o)
        return BigRat((self.n * o.d) // (self.d * o.n))

    def __floordiv__(self, o) -> "BigRat":
        o = o if isinstance(o, BigRat) else BigRat(o)
        return BigRat((self.n * o.d) // (self.d * o.n))

    def mod(self, o) -> "BigRat":
        o = o if isinstance(o, BigRat) else BigRat(o)
        return self - self.floordiv(o) * o

    def __mod__(self, o) -> "BigRat":
        o = o if isinstance(o, BigRat) else BigRat(o)
        return self.mod(o)

    def __eq__(self, o):
        o = o if isinstance(o, BigRat) else BigRat(o)
        return self.n * o.d == o.n * self.d

    def __lt__(self, o):
        o = o if isinstance(o, BigRat) else BigRat(o)
        return self.n * o.d < o.n * self.d

    def __le__(self, o):
        o = o if isinstance(o, BigRat) else BigRat(o)
        return self.n * o.d <= o.n * self.d

    def __gt__(self, o):
        o = o if isinstance(o, BigRat) else BigRat(o)
        return self.n * o.d > o.n * self.d

    def __ge__(self, o):
        o = o if isinstance(o, BigRat) else BigRat(o)
        return self.n * o.d >= o.n * self.d

    def __repr__(self):
        return f"BigRat({self.n},{self.d})"

    def _to_decimal(self) -> Decimal:
        with localcontext() as ctx:
            ctx.prec = max(50, DEFAULT_PREC + 20)
            return Decimal(self.n) / Decimal(self.d)

    def is_integer(self) -> bool:
        return self.d == 1

    def to_int(self) -> int:
        if self.d != 1:
            raise ValueError("不是整数")
        return self.n

    def to_float(self) -> float:
        return float(self.n) / float(self.d)

    def to_string(self, max_digits: int | None = None) -> str:
        """转为十进制字符串。有限小数给精确值；无限小数给高精度近似。"""
        digits = max_digits if max_digits is not None else DEFAULT_PREC
        if self.d == 1:
            return str(self.n)
        sign = "-" if (self.n < 0) != (self.d < 0) else ""
        num, den = abs(self.n), abs(self.d)
        int_part, rem = divmod(num, den)
        d2 = den
        for p in (2, 5):
            while d2 % p == 0:
                d2 //= p
        out = sign + str(int_part)
        if d2 == 1:
            frac = []
            while rem != 0:
                frac.append(str((rem * 10) // den))
                rem = (rem * 10) % den
                if len(frac) > 200000:
                    break
            return out + ("." + "".join(frac) if frac else "")
        with localcontext() as ctx:
            ctx.prec = digits + 5
            v = Decimal(self.n) / Decimal(self.d)
            ctx.prec = digits
            s = format(v, f".{digits}f")
        if "." in s:
            s = s.rstrip("0").rstrip(".")
        return s


def _to_dec(x) -> Decimal:
    if isinstance(x, BigRat):
        return x._to_decimal()
    if isinstance(x, Decimal):
        return x
    return Decimal(str(x))


def _add(a, b):
    return a + b if isinstance(a, BigRat) and isinstance(b, BigRat) else _to_dec(a) + _to_dec(b)


def _sub(a, b):
    return a - b if isinstance(a, BigRat) and isinstance(b, BigRat) else _to_dec(a) - _to_dec(b)


def _mul(a, b):
    return a * b if isinstance(a, BigRat) and isinstance(b, BigRat) else _to_dec(a) * _to_dec(b)


def _div(a, b):
    if isinstance(a, BigRat) and isinstance(b, BigRat):
        return a / b
    return _to_dec(a) / _to_dec(b)


def _pow(a, b):
    if isinstance(b, BigRat) and b.is_integer():
        if isinstance(a, BigRat):
            return a ** b.to_int()
        return _to_dec(a) ** b.to_int()
    if isinstance(b, int):
        return (a if isinstance(a, BigRat) else BigRat(a)) ** b
    return _to_dec(a) ** _to_dec(b)


# ---------------------------------------------------------------------------
# 高精度常数（按需由级数生成）
# ---------------------------------------------------------------------------
def _atan_series(x: Decimal, p: int) -> Decimal:
    x2 = x * x
    t, s, n = x, Decimal(0), 1
    tol = Decimal(1).scaleb(-(p + 6))
    while True:
        s += t / n
        n += 2
        t *= -x2
        if abs(t) < tol:
            return s


def compute_pi(p: int | None = None) -> Decimal:
    """Machin 公式：pi/4 = 4*atan(1/5) - atan(1/239)。"""
    with localcontext() as ctx:
        ctx.prec = (p or DEFAULT_PREC) + 15
        return Decimal(16) * _atan_series(Decimal(1) / 5, ctx.prec) - Decimal(4) * _atan_series(Decimal(1) / 239, ctx.prec)


def compute_e(p: int | None = None) -> Decimal:
    with localcontext() as ctx:
        ctx.prec = (p or DEFAULT_PREC) + 15
        s, t, k = Decimal(1), Decimal(1), 1
        tol = Decimal(1).scaleb(-(ctx.prec + 6))
        while True:
            t /= k
            s += t
            k += 1
            if t < tol:
                return s


def compute_ln2(p: int | None = None) -> Decimal:
    with localcontext() as ctx:
        ctx.prec = (p or DEFAULT_PREC) + 15
        x = Decimal(1) / 3
        x2 = x * x
        t, s, n = x, Decimal(0), 1
        tol = Decimal(1).scaleb(-(ctx.prec + 6))
        while True:
            s += t / n
            n += 2
            t *= x2
            if t < tol:
                return s * 2


def _get_pi():
    return compute_pi()


def _get_e():
    return compute_e()


# ---------------------------------------------------------------------------
# 超越函数（Decimal 高精度）
# ---------------------------------------------------------------------------
def _dec(x) -> Decimal:
    return x if isinstance(x, Decimal) else _to_dec(x)


def sin(x) -> Decimal:
    with localcontext() as ctx:
        ctx.prec = getcontext().prec + 20
        s, _ = _series_sin_cos(_dec(x) % (compute_pi(ctx.prec) * 2))
        return s


def cos(x) -> Decimal:
    with localcontext() as ctx:
        ctx.prec = getcontext().prec + 20
        _, c = _series_sin_cos(_dec(x) % (compute_pi(ctx.prec) * 2))
        return c


def tan(x) -> Decimal:
    with localcontext() as ctx:
        ctx.prec = getcontext().prec + 20
        s, c = _series_sin_cos(_dec(x) % (compute_pi(ctx.prec) * 2))
        if c == 0:
            raise ValueError("tan 在奇数倍 pi/2 处未定义")
        return s / c


def _series_sin_cos(x: Decimal):
    """sin/cos 泰勒级数，x 已约化。"""
    with localcontext() as ctx:
        p = ctx.prec
        pi = compute_pi(p)
        half = pi / 2
        if x > half:
            x = pi - x
        elif x < -half:
            x = -pi - x
        x2 = x * x
        tol = Decimal(1).scaleb(-(p + 6))
        s, t, n = x, x, 1
        while True:
            t *= -x2 / ((2 * n) * (2 * n + 1))
            s += t
            n += 1
            if abs(t) < tol:
                break
        c, t = Decimal(1), Decimal(1)
        n = 1
        while True:
            t *= -x2 / ((2 * n - 1) * (2 * n))
            c += t
            n += 1
            if abs(t) < tol:
                break
        return s, c


def atan(x) -> Decimal:
    x = _dec(x)
    with localcontext() as ctx:
        ctx.prec = getcontext().prec + 20
        p = ctx.prec
        neg = x < 0
        ax = abs(x)
        flip = ax > 1
        if flip:
            ax = 1 / ax
        u = ax / (1 + (1 + ax * ax).sqrt())
        res = _atan_series(u, p) * 2
        if flip:
            res = compute_pi(p) / 2 - res
        return -res if neg else res


def asin(x) -> Decimal:
    x = _dec(x)
    if x < -1 or x > 1:
        raise ValueError("asin 的定义域为 [-1,1]")
    if x == 1:
        return compute_pi() / 2
    if x == -1:
        return -compute_pi() / 2
    return atan(x / (1 - x * x).sqrt())


def acos(x) -> Decimal:
    x = _dec(x)
    if x < -1 or x > 1:
        raise ValueError("acos 的定义域为 [-1,1]")
    return compute_pi() / 2 - asin(x)


def ln(x) -> Decimal:
    x = _dec(x)
    if x <= 0:
        raise ValueError("ln 的定义域为 x>0")
    with localcontext() as ctx:
        ctx.prec = getcontext().prec + 20
        e = compute_e(ctx.prec)
        n = 0
        while x > 2:
            x = x / e
            n += 1
        while x < Decimal("0.5"):
            x = x * e
            n -= 1
        y = (x - 1) / (x + 1)
        y2 = y * y
        s, t, k = Decimal(0), y, 1
        tol = Decimal(1).scaleb(-(ctx.prec + 6))
        while True:
            s += t / k
            k += 2
            t *= y2
            if abs(t) < tol:
                break
        return Decimal(n) + 2 * s


def log10(x) -> Decimal:
    return ln(x) / ln(Decimal(10))


def log_b(x, b) -> Decimal:
    b = _dec(b)
    if b <= 0 or b == 1:
        raise ValueError("对数底必须 >0 且 ≠1")
    return ln(x) / ln(b)


def exp(x) -> Decimal:
    x = _dec(x)
    with localcontext() as ctx:
        ctx.prec = getcontext().prec + 20
        ln2 = compute_ln2(ctx.prec)
        n = 0
        while x > 1:
            x -= ln2
            n += 1
        while x < -1:
            x += ln2
            n -= 1
        s, t, k = Decimal(1), Decimal(1), 1
        tol = Decimal(1).scaleb(-(ctx.prec + 6))
        while True:
            t *= x / k
            s += t
            k += 1
            if abs(t) < tol:
                break
        return s * (Decimal(2) ** n)


def sinh(x) -> Decimal:
    x = _dec(x)
    return (exp(x) - exp(-x)) / 2


def cosh(x) -> Decimal:
    x = _dec(x)
    return (exp(x) + exp(-x)) / 2


def tanh(x) -> Decimal:
    x = _dec(x)
    e = exp(2 * x)
    return (e - 1) / (e + 1)


def sqrt(x) -> Decimal:
    x = _dec(x)
    if x < 0:
        raise ValueError("负数不能开平方")
    return x.sqrt()


def cbrt(x) -> Decimal:
    x = _dec(x)
    with localcontext() as ctx:
        ctx.prec = getcontext().prec + 10
        third = Decimal(1) / Decimal(3)
        return (abs(x) ** third) if x >= 0 else -(abs(x) ** third)


def nth_root(x, n) -> Decimal:
    x, n = _dec(x), _dec(n)
    if n == 0:
        raise ValueError("0 次根未定义")
    with localcontext() as ctx:
        ctx.prec = getcontext().prec + 10
        if n % 2 == 1 and x < 0:
            return -(Decimal(-x) ** (1 / n))
        if x < 0:
            raise ValueError("偶数次根对被开方数要求非负")
        return x ** (1 / n)


# ---------------------------------------------------------------------------
# 数论与组合
# ---------------------------------------------------------------------------
def _as_int(x):
    if isinstance(x, BigRat):
        if not x.is_integer():
            raise ValueError("该函数仅接受整数")
        return x.to_int()
    return int(x)


def gcd(a, b) -> BigRat:
    return BigRat(_igcd(_as_int(a), _as_int(b)))


def lcm(a, b) -> BigRat:
    a, b = _as_int(a), _as_int(b)
    if a == 0 or b == 0:
        return BigRat(0)
    return BigRat(abs(a * b) // _igcd(a, b))


_MILLER_BASES = (2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37)


def is_prime(n) -> bool:
    n = _as_int(n)
    if n < 2:
        return False
    for p in _MILLER_BASES:
        if n == p:
            return True
        if n % p == 0:
            return False
    d, s = n - 1, 0
    while d % 2 == 0:
        d //= 2
        s += 1
    for a in _MILLER_BASES:
        if a >= n:
            continue
        x = pow(a, d, n)
        if x in (1, n - 1):
            continue
        ok = False
        for _ in range(s - 1):
            x = (x * x) % n
            if x == n - 1:
                ok = True
                break
        if not ok:
            return False
    return True


def next_prime(n) -> BigRat:
    n = _as_int(n) + 1
    while not is_prime(n):
        n += 1
    return BigRat(n)


def factorize(n) -> list:
    n = _as_int(n)
    if n < 0:
        n = -n
    if n < 2:
        return []
    res = []
    d = 2
    while d * d <= n:
        if n % d == 0:
            c = 0
            while n % d == 0:
                n //= d
                c += 1
            res.append((d, c))
        d += 1 if d == 2 else 2
    if n > 1:
        res.append((n, 1))
    return res


def factorial(n) -> BigRat:
    n = _as_int(n)
    if n < 0:
        raise ValueError("负数的阶乘未定义")
    r = 1
    for i in range(2, n + 1):
        r *= i
    return BigRat(r)


def nCr(n, r) -> BigRat:
    n, r = _as_int(n), _as_int(r)
    if n < 0 or r < 0 or r > n:
        raise ValueError("组合数参数非法")
    r = min(r, n - r)
    num, den = 1, 1
    for i in range(1, r + 1):
        num *= (n - r + i)
        den *= i
    return BigRat(num, den)


def nPr(n, r) -> BigRat:
    n, r = _as_int(n), _as_int(r)
    if n < 0 or r < 0 or r > n:
        raise ValueError("排列数参数非法")
    res = 1
    for i in range(r):
        res *= (n - i)
    return BigRat(res)


# ---------------------------------------------------------------------------
# 递归下降表达式解析器
# ---------------------------------------------------------------------------
_NUM_RE = re.compile(r"\d+(?:\.\d*)?(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?")


class Parser:
    """解析表达式，全程使用 BigRat/Decimal，不经过 float。"""

    def __init__(self, s: str):
        self.s = s
        self.i = 0
        self.n = len(s)

    def skip(self):
        while self.i < self.n and self.s[self.i].isspace():
            self.i += 1

    def peek(self):
        self.skip()
        return self.s[self.i] if self.i < self.n else ""

    def parse(self):
        v = self._expr()
        self.skip()
        if self.i < self.n:
            raise ValueError(f"无法解析的位置: {self.s[self.i:]!r}")
        return v

    def _expr(self):
        v = self._term()
        while True:
            op = self.peek()
            if op == "+":
                self.i += 1
                v = _add(v, self._term())
            elif op == "-":
                self.i += 1
                v = _sub(v, self._term())
            else:
                return v

    def _term(self):
        v = self._power()
        while True:
            self.skip()
            if self.s[self.i:self.i + 2] == "//":
                self.i += 2
                r = self._power()
                v = (v.floordiv(r)) if isinstance(v, BigRat) and isinstance(r, BigRat) else _to_dec(v) // _to_dec(r)
                continue
            op = self.peek()
            if op == "*":
                self.i += 1
                v = _mul(v, self._power())
            elif op == "/":
                self.i += 1
                v = _div(v, self._power())
            elif op == "%":
                self.i += 1
                r = self._power()
                v = (v % r) if isinstance(v, BigRat) and isinstance(r, BigRat) else _to_dec(v) % _to_dec(r)
            else:
                return v

    def _power(self):
        base = self._unary()
        self.skip()
        if self.s[self.i:self.i + 2] == "**":
            self.i += 2
            exp = self._power()
            return _pow(base, exp)
        return base

    def _unary(self):
        op = self.peek()
        if op == "+":
            self.i += 1
            return self._unary()
        if op == "-":
            self.i += 1
            v = self._unary()
            return -v
        return self._atom()

    def _atom(self):
        self.skip()
        c = self.peek()
        if c == "(":
            self.i += 1
            v = self._expr()
            if self.peek() != ")":
                raise ValueError("缺少右括号")
            self.i += 1
            return v
        if c.isdigit() or c == ".":
            m = _NUM_RE.match(self.s, self.i)
            self.i = m.end()
            return BigRat(m.group(0))
        if c.isalpha() or c == "_":
            return self._call_or_const()
        raise ValueError(f"意外的字符: {c!r}")

    def _call_or_const(self):
        start = self.i
        while self.i < self.n and (self.s[self.i].isalnum() or self.s[self.i] == "_"):
            self.i += 1
        name = self.s[start:self.i]
        self.skip()
        if self.peek() == "(":
            self.i += 1
            args = []
            if self.peek() != ")":
                while True:
                    args.append(self._expr())
                    self.skip()
                    if self.peek() == ",":
                        self.i += 1
                        continue
                    break
            if self.peek() != ")":
                raise ValueError("函数调用缺少右括号")
            self.i += 1
            return _apply_function(name, args)
        consts = {"pi": "π", "π": None, "e": None, "phi": "φ", "φ": None, "tau": None, "ln2": None}
        if name == "pi" or name == "π":
            return compute_pi()
        if name == "e":
            return compute_e()
        if name == "phi" or name == "φ":
            with localcontext() as ctx:
                ctx.prec = getcontext().prec + 10
                return (1 + Decimal(5).sqrt()) / 2
        if name == "tau" or name == "τ":
            return compute_pi() * 2
        if name == "ln2":
            return compute_ln2()
        raise ValueError(f"未知标识符: {name!r}")


def _f1(fn, args):
    if len(args) != 1:
        raise ValueError("该函数需要一个参数")
    return fn(args[0])


def _f2(fn, args):
    if len(args) != 2:
        raise ValueError("该函数需要两个参数")
    return fn(args[0], args[1])


def _log_fn(args):
    if len(args) == 1:
        return log10(args[0])
    if len(args) == 2:
        return log_b(args[0], args[1])
    raise ValueError("log 需要一个或两个参数")


def _mod_fn(args):
    a, b = args[0], args[1]
    if isinstance(a, BigRat) and isinstance(b, BigRat):
        return a.mod(b)
    return _to_dec(a) % _to_dec(b)


def _floor_fn(x):
    if isinstance(x, BigRat):
        return x.floordiv(BigRat(1))
    return Decimal(x).to_integral_value(rounding="ROUND_FLOOR")


def _ceil_fn(x):
    if isinstance(x, BigRat):
        q = x.floordiv(BigRat(1))
        return q if x == q else q + BigRat(1)
    return Decimal(x).to_integral_value(rounding="ROUND_CEILING")


def _min_fn(args):
    if not args:
        raise ValueError("min 需要至少一个参数")
    r = args[0]
    for x in args[1:]:
        if x < r:
            r = x
    return r


def _max_fn(args):
    if not args:
        raise ValueError("max 需要至少一个参数")
    r = args[0]
    for x in args[1:]:
        if x > r:
            r = x
    return r


_FUNCTIONS = {
    "sin": lambda a: _f1(sin, a),
    "cos": lambda a: _f1(cos, a),
    "tan": lambda a: _f1(tan, a),
    "asin": lambda a: _f1(asin, a),
    "acos": lambda a: _f1(acos, a),
    "atan": lambda a: _f1(atan, a),
    "sinh": lambda a: _f1(sinh, a),
    "cosh": lambda a: _f1(cosh, a),
    "tanh": lambda a: _f1(tanh, a),
    "ln": lambda a: _f1(ln, a),
    "log": _log_fn,
    "log10": lambda a: _f1(log10, a),
    "log2": lambda a: _f1(lambda x: ln(x) / compute_ln2(), a),
    "exp": lambda a: _f1(exp, a),
    "sqrt": lambda a: _f1(sqrt, a),
    "cbrt": lambda a: _f1(cbrt, a),
    "root": lambda a: _f2(nth_root, a),
    "abs": lambda a: _f1(abs, a),
    "sign": lambda a: _f1(lambda x: BigRat(1) if x > 0 else (BigRat(-1) if x < 0 else BigRat(0)), a),
    "gcd": lambda a: _f2(gcd, a),
    "lcm": lambda a: _f2(lcm, a),
    "fact": lambda a: _f1(factorial, a),
    "factorial": lambda a: _f1(factorial, a),
    "nCr": lambda a: _f2(nCr, a),
    "nPr": lambda a: _f2(nPr, a),
    "isprime": lambda a: _f1(lambda x: is_prime(x), a),
    "nextprime": lambda a: _f1(next_prime, a),
    "factor": lambda a: _f1(lambda x: factorize(x), a),
    "floor": lambda a: _f1(_floor_fn, a),
    "ceil": lambda a: _f1(_ceil_fn, a),
    "min": _min_fn,
    "max": _max_fn,
    "mod": _mod_fn,
}


def _apply_function(name, args):
    f = _FUNCTIONS.get(name)
    if f is None:
        raise ValueError(f"未知函数: {name!r}")
    return f(args)


def _format_result(v, digits: int | None = None) -> str:
    digits = digits if digits is not None else DEFAULT_PREC
    if isinstance(v, bool):
        return "True" if v else "False"
    if isinstance(v, BigRat):
        return v.to_string(digits)
    if isinstance(v, Decimal):
        with localcontext() as ctx:
            ctx.prec = digits
            r = +v  # 按当前精度舍入
            s = format(r, 'f')
        if "." in s:
            s = s.rstrip("0").rstrip(".")
            if s.endswith("."):
                s = s[:-1]
        return s
    if isinstance(v, list):
        return " × ".join(f"{p}^{e}" if e > 1 else str(p) for p, e in v)
    return str(v)


def evaluate(expr: str, digits: int | None = None) -> str:
    """计算表达式字符串，返回结果字符串（高精度）。"""
    if digits is not None:
        set_precision(digits)
    clean = (expr.replace("^", "**").replace("×", "*").replace("÷", "/")
             .replace("−", "-").replace("π", "pi").replace("φ", "phi").replace("τ", "tau"))
    try:
        v = Parser(clean).parse()
    except Exception as e:
        return f"错误: {e}"
    return _format_result(v, digits)


def repl():
    print("Liquid Glass 数学引擎 — 输入表达式（如 2**100、sin(pi/2)、fact(50)），Ctrl+D 退出。")
    while True:
        try:
            line = input(">>> ").strip()
        except (EOFError, KeyboardInterrupt):
            break
        if not line:
            continue
        if line.lower() in ("q", "quit", "exit"):
            break
        print(evaluate(line))


if __name__ == "__main__":
    repl()
