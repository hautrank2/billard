"use client";

import { ArrowRight, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { BrandLogo } from "~/components/brand-logo";
import { GoogleIcon } from "~/components/icons";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import type { Gender } from "../_components/lobby/hall-types";
import { messageOf, readLobby } from "../_components/lobby/hook";
import { AvatarPreview } from "../_components/lobby/lobby-scene";
import "../_components/lobby/lobby.css";

export default function LoginPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [gender, setGender] = useState<Gender>("male");
  const [birthYear, setBirthYear] = useState("");
  const [address, setAddress] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [registered, setRegistered] = useState(false);

  useEffect(() => {
    let current = true;
    const authError = new URLSearchParams(window.location.search).get("error");
    void readLobby().then(({ player }) => {
      if (current && authError) setError(authError);
      if (!current || !player) return;
      setName(player.name);
      setRegistered(player.registered);
      setGender(player.gender ?? "male");
      setBirthYear(player.birthYear?.toString() ?? "");
      setAddress(player.address ?? "");
    }).catch((caught: unknown) => {
      if (current) setError(messageOf(caught));
    }).finally(() => {
      if (current) setReady(true);
    });
    return () => { current = false; };
  }, []);

  return (
    <main className="rollnine login">
      <header className="login-header">
        <BrandLogo />
        <Link href="/billiard">Luyện tập <ArrowUpRight size={15} aria-hidden="true" /></Link>
      </header>
      <div className="login-layout">
        <div className="login-stage">
          <AvatarPreview gender={gender} />
          <div className="login-avatar-name">Avatar {gender === "male" ? "nam" : "nữ"}</div>
        </div>
        <section className="login-card" aria-labelledby="login-title">
          <h1 id="login-title">Vào quán bida</h1>
          <p>{registered ? "Tài khoản Gmail đã liên kết. Cập nhật hồ sơ của bạn." : "Chơi ngay với tư cách khách, hoặc đăng ký bằng Gmail để nhận xu và mua gậy."}</p>
          {!registered && <a className="lobby-primary login-google" href="/api/auth/google"><GoogleIcon size={18} />Đăng ký / Đăng nhập bằng Gmail</a>}
          {!registered && <p className="login-account-note">Tặng 200 xu khi đăng ký Gmail lần đầu. Khách vẫn có thể đấu 1v1, dùng gậy tiêu chuẩn.</p>}
          <form onSubmit={async (event) => {
            event.preventDefault();
            if (!ready || busy || name.trim().length < 2) return;
            setBusy(true);
            setError("");
            try {
              const { player } = await readLobby({
                type: "profile", name,
                details: { gender, birthYear: birthYear ? Number(birthYear) : undefined, address: address.trim() || undefined },
              });
              if (!player) throw new Error("Không thể lưu hồ sơ. Hãy thử lại.");
              router.replace("/");
            } catch (caught) {
              setError(messageOf(caught));
              setBusy(false);
            }
          }}>
            <label htmlFor="guest-name">Tên hiển thị</label>
            <Input id="guest-name" value={name} onChange={(event) => setName(event.currentTarget.value)}
              placeholder="Nhập tên của bạn" autoComplete="nickname" minLength={2} maxLength={24} required disabled={!ready || busy} />
            <fieldset className="login-gender" disabled={!ready || busy}>
              <legend>Giới tính</legend>
              <div>
                <label><input type="radio" name="gender" value="male" checked={gender === "male"} onChange={() => setGender("male")} /> Nam</label>
                <label><input type="radio" name="gender" value="female" checked={gender === "female"} onChange={() => setGender("female")} /> Nữ</label>
              </div>
            </fieldset>
            <label htmlFor="birth-year">Năm sinh <span>Không bắt buộc</span></label>
            <Input id="birth-year" type="number" inputMode="numeric" autoComplete="bday-year" placeholder="Ví dụ 2000"
              min={1900} max={new Date().getUTCFullYear()} value={birthYear} onChange={(event) => setBirthYear(event.currentTarget.value)} disabled={!ready || busy} />
            <label htmlFor="guest-address">Địa chỉ <span>Không bắt buộc</span></label>
            <Input id="guest-address" value={address} onChange={(event) => setAddress(event.currentTarget.value)}
              placeholder="Tỉnh hoặc thành phố" maxLength={100} disabled={!ready || busy} />
            {error && <p className="lobby-error" role="alert">{error}</p>}
            <Button className="lobby-primary login-submit" size="lg" type="submit" disabled={!ready || busy || name.trim().length < 2}>
              {busy ? "Đang vào sảnh…" : registered ? "Lưu và vào sảnh" : "Chơi với tư cách khách"} <ArrowRight aria-hidden="true" />
            </Button>
          </form>
        </section>
      </div>
    </main>
  );
}
